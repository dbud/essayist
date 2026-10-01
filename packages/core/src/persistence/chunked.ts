/**
 * Stores a value too large for one KV entry, where a single entry caps at
 * 64 KiB.
 *
 * A value that fits is stored as one entry: a six-byte header, then the
 * bytes. A larger value is split across several keys under the same base
 * key, numbered by position so a scan returns them in order.
 */

import { sortBy } from "@std/collections";
import type { Entry, Key, PersistenceAdapter } from "./mod.ts";

/** Deno KV's cap on one value. Nothing is added on top of a Uint8Array's
 * length, so a chunk can fill this exactly. */
export const MAX_VALUE_BYTES = 65_536;

const MAGIC = 0xc1;
const HEADER_BYTES = 6;

export const CHUNK_PAYLOAD_BYTES = MAX_VALUE_BYTES - HEADER_BYTES;

/** How many keys getMany reads at once. */
export const GET_MANY_MAX = 10;

export interface ChunkHeader {
  nChunks: number;
  payload: Uint8Array;
}

/** One chunk of a value: the bytes to store, and the key part to store them
 * under. The head takes the base key, the tail takes "c1", "c2" and so on. */
export interface Chunk {
  key: Key;
  value: Uint8Array;
}

export function frameChunk(payload: Uint8Array, nChunks: number): Uint8Array {
  const framed = new Uint8Array(HEADER_BYTES + payload.length);
  framed[0] = MAGIC;
  // Reserved for future flags. Always zero.
  framed[1] = 0;
  new DataView(framed.buffer).setUint32(2, nChunks, true);
  framed.set(payload, HEADER_BYTES);
  return framed;
}

export function unframeChunk(value: unknown): ChunkHeader | null {
  if (!(value instanceof Uint8Array) || value.length < HEADER_BYTES)
    return null;
  if (value[0] !== MAGIC) return null;
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  const nChunks = view.getUint32(2, true);
  if (nChunks < 1) return null;
  return { nChunks, payload: value.subarray(HEADER_BYTES) };
}

export function planChunks(
  payload: Uint8Array,
  maxPayload: number = CHUNK_PAYLOAD_BYTES,
): Chunk[] {
  const nChunks = Math.max(1, Math.ceil(payload.length / maxPayload));
  const chunks: Chunk[] = [];
  for (let i = 0; i < nChunks; i++) {
    const slice = payload.subarray(i * maxPayload, (i + 1) * maxPayload);
    chunks.push({
      key: i === 0 ? [] : [chunkKeyPart(i, nChunks)],
      value: frameChunk(slice, nChunks),
    });
  }
  return chunks;
}

/** The suffix for a chunk, padded so that chunks sort in order. The width
 * comes from the chunk count, so a reader can work it out from the header. */
export function chunkKeyPart(index: number, nChunks: number): string {
  return `c${String(index).padStart(String(nChunks).length, "0")}`;
}

export interface AssembledValue {
  key: Key;
  payload?: Uint8Array;
  nChunks: number;
  nReceived: number;
  /** A value this layer did not write, kept as stored. */
  raw?: unknown;
}

export function splitChunkKey(key: Key): { base: Key; index: number } {
  const match = /^c(\d+)$/.exec(key.at(-1) ?? "");
  if (!match) return { base: key, index: 0 };
  return { base: key.slice(0, -1), index: Number(match[1]) };
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

function assembleOne(
  key: Key,
  nChunks: number,
  chunks: Map<number, Uint8Array> | undefined,
): AssembledValue {
  const nReceived = chunks?.size ?? 0;
  if (!chunks || nReceived < nChunks) return { key, nChunks, nReceived };
  const ordered = sortBy([...chunks], ([index, ..._]) => index).map(
    ([, chunk]) => chunk,
  );
  return { key, nChunks, nReceived, payload: concat(ordered) };
}

type Found =
  | { chunked: false; key: Key; raw: unknown }
  | { chunked: true; key: Key; header: ChunkHeader };

/**
 * Put back together every value written by this layer in a scan, and leave
 * the rest as they came. A value missing a chunk comes back with no bytes.
 */
export function assembleList(entries: readonly Entry[]): AssembledValue[] {
  const found = new Map<string, Found>();
  const parts = new Map<string, Map<number, Uint8Array>>();

  for (const entry of entries) {
    const header = unframeChunk(entry.value);
    if (!header) {
      const id = String(entry.key);
      if (!found.has(id)) {
        found.set(id, { chunked: false, key: entry.key, raw: entry.value });
      }
      continue;
    }
    const { base, index } = splitChunkKey(entry.key);
    const id = String(base);
    if (index === 0 && !found.has(id)) {
      found.set(id, { chunked: true, key: base, header });
    }
    parts
      .getOrInsert(id, new Map<number, Uint8Array>())
      .set(index, header.payload);
  }

  return [...found.values()].map((value) => {
    if (!value.chunked) {
      return { key: value.key, nChunks: 1, nReceived: 1, raw: value.raw };
    }
    return assembleOne(
      value.key,
      value.header.nChunks,
      parts.get(String(value.key)),
    );
  });
}

/** Read one value, fetching the rest of its chunks in batches. */
export async function readChunked(
  adapter: PersistenceAdapter,
  key: Key,
  options?: { consistency?: "strong" | "eventual" },
): Promise<AssembledValue | undefined> {
  const head = await adapter.get(key, options);
  if (!head) return undefined;
  const header = unframeChunk(head.value);
  if (!header) return { key, nChunks: 1, nReceived: 1, raw: head.value };
  if (header.nChunks === 1) {
    return { key, nChunks: 1, nReceived: 1, payload: header.payload };
  }

  const rest: Key[] = [];
  for (let i = 1; i < header.nChunks; i++) {
    rest.push([...key, chunkKeyPart(i, header.nChunks)]);
  }

  const chunks = new Map<number, Uint8Array>([[0, header.payload]]);
  for (let i = 0; i < rest.length; i += GET_MANY_MAX) {
    const batch = rest.slice(i, i + GET_MANY_MAX);
    const found = await adapter.getMany<unknown>(batch, options);
    for (const entry of found) {
      const part = entry && unframeChunk(entry.value);
      if (!part) continue;
      chunks.set(splitChunkKey(entry.key).index, part.payload);
    }
  }
  return assembleOne(key, header.nChunks, chunks);
}
