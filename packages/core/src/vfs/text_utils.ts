export interface Token {
  text: string;
  offset: number;
  endOffset: number;
}

export type Tokenizer = (text: string) => Token[];

/**
 * Build a tokenizer from a scanning regex.
 *
 * `regex` must have the global flag (checked once at build time), or this
 * throws -- a non-global regex would loop forever on `exec`. The returned
 * function resets `regex.lastIndex` before each scan, so a single shared
 * module-level regex is safe to reuse across calls.
 */
export function createTokenizer(regex: RegExp): Tokenizer {
  if (!regex.global) {
    throw new TypeError("createTokenizer: regex must have the global flag");
  }
  return (text: string): Token[] => {
    const tokens: Token[] = [];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while (true) {
      match = regex.exec(text);
      if (match === null) break;
      const offset = match.index;
      tokens.push({
        text: match[0],
        offset,
        endOffset: offset + match[0].length,
      });
    }
    return tokens;
  };
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const NON_WORD_NON_SPACE = /[^\s\p{L}\p{N}]/u;

/**
 * Whether each edge of `text` is a word character (Unicode letter/number).
 * Empty text has neither. Used to decide which gap separators belong to a
 * context rather than the selection.
 */
export function wordEdges(text: string): {
  startsWithWord: boolean;
  endsWithWord: boolean;
} {
  const startsWithWord = text.length > 0 && WORD_CHAR.test(text[0]);
  const endsWithWord = text.length > 0 && WORD_CHAR.test(text[text.length - 1]);
  return { startsWithWord, endsWithWord };
}

/**
 * Count separator chars to trim from the start of `raw`: whitespace always,
 * then punctuation if `trimPunctuation`.
 */
function countLeadingSeparators(raw: string, trimPunctuation: boolean): number {
  let n = 0;
  while (n < raw.length && /\s/.test(raw[n])) n++;
  if (trimPunctuation) {
    while (n < raw.length && NON_WORD_NON_SPACE.test(raw[n])) n++;
  }
  return n;
}

/**
 * Count separator chars to trim from the end of `raw`, stopping at
 * `lowerBound` (the leading trim count, so the two never overlap): whitespace
 * always, then punctuation if `trimPunctuation`.
 */
function countTrailingSeparators(
  raw: string,
  lowerBound: number,
  trimPunctuation: boolean,
): number {
  let n = 0;
  let i = raw.length - 1;
  while (i >= lowerBound && /\s/.test(raw[i])) {
    n++;
    i--;
  }
  if (trimPunctuation) {
    while (i >= lowerBound && NON_WORD_NON_SPACE.test(raw[i])) {
      n++;
      i--;
    }
  }
  return n;
}

/**
 * Trim surrounding separator characters from a resolved gap. Whitespace is
 * always trimmed on both sides. Punctuation is trimmed on a side only when
 * `trimLeadingPunctuation` / `trimTrailingPunctuation` is set (meaning the
 * separator there belongs to a context, not the selection). Returns the
 * trimmed text and how many leading chars were removed (so the caller can
 * adjust the offset).
 */
export function trimContextSeparators(
  raw: string,
  trimLeadingPunctuation: boolean,
  trimTrailingPunctuation: boolean,
): { text: string; leading: number } {
  if (raw.length === 0) return { text: "", leading: 0 };

  const leading = countLeadingSeparators(raw, trimLeadingPunctuation);
  const trailing = countTrailingSeparators(
    raw,
    leading,
    trimTrailingPunctuation,
  );

  return { text: raw.slice(leading, raw.length - trailing), leading };
}
