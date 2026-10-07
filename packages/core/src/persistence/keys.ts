// Key helpers shared by the map-backed and KV-backed persistence backends.

import type { Key } from "./mod.ts";

/** Serialize a key to a stable string (for map indexing). */
export function keyToString(key: Key): string {
  return JSON.stringify(key);
}

/** Compare two tuple keys lexicographically, part by part (string comparison). */
export function compareKeys(a: Key, b: Key): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}

/** True if `key` starts with the tuple `prefix` (every part matches). */
export function keyStartsWith(key: Key, prefix: Key): boolean {
  if (key.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (key[i] !== prefix[i]) return false;
  }
  return true;
}
