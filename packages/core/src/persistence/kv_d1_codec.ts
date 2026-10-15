/**
 * Wire encoding for the D1-backed kv table.
 *
 * Keys use the FoundationDB tuple encoding (via fdb-tuple): order-preserving,
 * self-framing bytes, so byte order equals tuple order and a prefix scan is
 * a plain range over the storage order. Values use CBOR (via cbor-x), which
 * round-trips JSON-like shapes and Uint8Array chunks exactly.
 *
 * Both transports (worker binding and REST) only carry TEXT, so keys are
 * stored hex-encoded and values base64-stored; byte order then equals the
 * order of the hex text.
 */

import {
  decodeBase64,
  decodeHex,
  encodeBase64,
  encodeHex,
} from "@std/encoding";
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

/** The [begin, end) storage range containing exactly the keys with `key` as
 * a prefix, the prefix key itself included. The last byte of a packed tuple
 * is the 0x00 terminator for our string-only keys, so the exclusive upper
 * bound is the same bytes with that byte bumped. */
export interface KeyRange {
  readonly begin: string;
  /** undefined means no upper bound: an empty prefix spans the table. */
  readonly end: string | undefined;
}

/** The storage range for a prefix scan. */
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

/** A value as the base64 text stored in the D1 table. */
export function encodeValue(value: unknown): string {
  return encodeBase64(cbor.encode(value));
}

/** The value of a base64 text stored in the D1 table. */
export function decodeValue<T = unknown>(text: string): T {
  return cbor.decode(decodeBase64(text)) as T;
}
