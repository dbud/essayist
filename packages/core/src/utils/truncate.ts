/**
 * Byte-budgeted truncation for strings stored in KV, where values cap
 * at 64 KiB. Slices never split a UTF-8 sequence.
 */

/** A kept part of a text, and whether bytes were dropped to fit. */
export interface Cut {
  text: string;
  truncated: boolean;
}

/** UTF-8 byte size of the text. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** The first part of the text that fits in maxBytes bytes. */
export function keepHead(text: string, maxBytes: number): Cut {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return { text, truncated: false };
  let end = Math.max(0, maxBytes);
  while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
  return {
    text: new TextDecoder().decode(bytes.slice(0, end)),
    truncated: true,
  };
}

/** The last part of the text that fits in maxBytes bytes. */
export function keepTail(text: string, maxBytes: number): Cut {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return { text, truncated: false };
  let start = Math.max(0, bytes.length - maxBytes);
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++;
  return {
    text: new TextDecoder().decode(bytes.slice(start)),
    truncated: true,
  };
}
