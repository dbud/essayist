import type { EditorState } from "lexical";
import { BlockFold, type Monoid } from "./incrementalBlocks.ts";

// Words are alphanumeric runs, optionally joined by single hyphens, so
// hyphenated words count as one ("well-known" is one word). Note: core's
// wordTokens (vfs/text_search.ts) still splits on hyphens.
const WORD_REGEX = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;

// Non-whitespace characters for the "no spaces" count. \s matches NBSP too.
const NON_WS_REGEX = /\S/g;

// String.prototype.match with a global regex ignores lastIndex, so the
// shared regexes are safe to reuse.
function countMatches(text: string, regex: RegExp): number {
  return text.match(regex)?.length ?? 0;
}

const sumMonoid: Monoid<number> = {
  identity: 0,
  combine: (a, b) => a + b,
};

export const wordCountFold = new BlockFold<number>({
  monoid: sumMonoid,
  compute: (block) => countMatches(block.getTextContent(), WORD_REGEX),
});

export const charCountFold = new BlockFold<number>({
  monoid: sumMonoid,
  compute: (block) => countMatches(block.getTextContent(), NON_WS_REGEX),
});

export const charCountWithSpacesFold = new BlockFold<number>({
  monoid: sumMonoid,
  compute: (block) => block.getTextContent().length,
});

/** Word count of an EditorState, using the incremental cache when warm. */
export function editorStateWordCount(state: EditorState): number {
  return wordCountFold.read(state);
}

// Characters excluding whitespace
export function editorStateCharCount(state: EditorState): number {
  return charCountFold.read(state);
}

// All characters including spaces. Block separators count in neither
// character stat; paragraph marks are not characters.
export function editorStateCharCountWithSpaces(state: EditorState): number {
  return charCountWithSpacesFold.read(state);
}
