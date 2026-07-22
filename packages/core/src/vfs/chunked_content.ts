/**
 * Chunked content storage for the VFS.
 *
 * Deno Deploy KV caps a single value at 64 KiB. The first chunk is always
 * inlined in the manifest; additional chunks (if any) are stored as separate
 * KV keys. Chunks never split a multi-byte UTF-8 sequence.
 */

/** Chunk byte size; under KV's 64 KiB value limit with headroom for manifest metadata. */
export const CHUNK_SIZE = 60 * 1024;

/** Reassembly manifest. `firstChunk` is chunk 0 inline; `chunkCount` is the total chunk count. */
export interface ContentManifest {
  /** Total chunks, including the inlined first. Always >= 1. */
  chunkCount: number;
  /** Chunk 0. The whole content when `chunkCount === 1`. */
  firstChunk: Uint8Array;
}

/** Output of {@link chunkContent}: a manifest plus any extra chunk keys to write. */
export interface ChunkedContent {
  manifest: ContentManifest;
  /** Chunks 1..N-1. Empty when content fits in one chunk. */
  extraChunks: Uint8Array[];
}

/** Split into UTF-8 byte chunks of at most `maxBytes`, never inside a multi-byte sequence. Empty input returns `[]`. */
export function splitContent(
  content: string,
  maxBytes: number = CHUNK_SIZE,
): Uint8Array[] {
  const bytes = new TextEncoder().encode(content);
  const chunks: Uint8Array[] = [];
  let i = 0;
  while (i < bytes.length) {
    let end = Math.min(i + maxBytes, bytes.length);
    // Back up past continuation bytes (0b10xxxxxx) to a leading byte.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(bytes.slice(i, end));
    i = end;
  }
  return chunks;
}

/** Concatenate and decode. Returns `""` for `[]`. */
export function joinChunks(chunks: Uint8Array[]): string {
  if (chunks.length === 0) return "";
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

/** Reassemble content from a manifest and its fetched extra chunks. */
export function reassemble(
  manifest: ContentManifest,
  extraChunks: Uint8Array[],
): string {
  if (manifest.chunkCount === 1) {
    return new TextDecoder().decode(manifest.firstChunk);
  }
  return joinChunks([manifest.firstChunk, ...extraChunks]);
}

/**
 * Split content into a manifest (chunk 0 inlined) plus extra chunks to write
 * as separate keys. Atomic: the manifest and extra chunks come from the same
 * split, so they can't diverge.
 */
export function chunkContent(
  content: string,
  maxBytes: number = CHUNK_SIZE,
): ChunkedContent {
  const chunks = splitContent(content, maxBytes);
  return {
    manifest: {
      chunkCount: Math.max(1, chunks.length),
      firstChunk: chunks[0] ?? new Uint8Array(0),
    },
    extraChunks: chunks.slice(1),
  };
}
