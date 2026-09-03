import type { EditorState } from "lexical";
import { BlockFold, type Monoid } from "./incrementalBlocks.ts";

// Same token rule as core's wordTokens (vfs/text_search.ts): alphanumeric
// runs are words, so punctuation and markdown syntax contribute nothing.
const WORD_REGEX = /[\p{L}\p{N}]+/gu;

function countWords(text: string): number {
  return text.match(WORD_REGEX)?.length ?? 0;
}

const sumMonoid: Monoid<number> = {
  identity: 0,
  combine: (a, b) => a + b,
};

export const wordCountFold = new BlockFold<number>({
  monoid: sumMonoid,
  compute: (block) => countWords(block.getTextContent()),
});

/** Word count of an EditorState, using the incremental cache when warm. */
export function editorStateWordCount(state: EditorState): number {
  return wordCountFold.read(state);
}
