/**
 * Wire encoding for the D1-backed kv table.
 *
 * Keys hex-encode the FoundationDB tuple format (via fdb-tuple):
 * order-preserving, self-framing bytes, so byte order equals tuple order,
 * prefix scans are a plain range, and hex text keeps the order. Values
 * base64-encode CBOR (via cbor-x), which carries the JSON-like domain
 * values and Uint8Array chunks intact. Both transports only see TEXT.
 */

import { decodeBase64, decodeHex, encodeBase64, encodeHex } from "@std/encoding";
import * as cbor from "cbor-x";
import { pack, unpack } from "fdb-tuple";

import type { Key } from "./mod.ts";

/** The packed bytes of a tuple key. */
export function packKeyBytes(key: Key): Uint8Array {
  const packed = pack([...key]);
  return Uint8Array.from(packed);
}

/** A key as the hex text stored in the D1 table. */
export function packKey(key: Key): string {
  return encodeHex(packKeyBytes(key));
}

/** The key of a hex text stored in the D1 table. */
export function unpackKey(text: string): Key {
  return unpack(Buffer.from(decodeHex(text))) as Key;
}

export interface KeyRange {
  readonly begin: string;
  /** The exclusive upper bound; undefined = unbounded. */
  readonly end: string | undefined;
}

/** The [begin, end) hex-text range containing exactly the keys with `key`
 * as a prefix, the prefix key included. The last byte of a packed tuple is
 * the 0x00 terminator, so the exclusive bound bumps that byte; an empty
 * prefix is unbounded. */
export function keyRange(prefix: Key): KeyRange {
  const bytes = packKeyBytes(prefix);
  if (bytes.length === 0) return { begin: "", end: undefined };
  const end = Uint8Array.from(bytes);
  end[end.length - 1] += 1;
  return {
    begin: encodeHex(bytes),
    end: encodeHex(end),
  };
}

export function encodeValue(value: unknown): string {
  return encodeBase64(cbor.encode(value));
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- callers pass the value type; kv_d1 chains it
export function decodeValue<T = unknown>(text: string): T {
  return cbor.decode(decodeBase64(text)) as T;
}
