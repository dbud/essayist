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
