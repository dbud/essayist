import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import {
  $isParagraphNode,
  $isTextNode,
  type EditorState,
  type ElementNode,
  type LexicalNode,
} from "lexical";
import { BlockFold, type Monoid } from "./incrementalBlocks.ts";

const EMPTY_LINE = /^\s{0,3}$/;

// Mirrors Lexical's internal isEmptyParagraph for the join separator logic.
function $isEmptyParagraph(node: LexicalNode | null | undefined): boolean {
  if (!$isParagraphNode(node)) return false;
  const first = node.getFirstChild();
  return (
    first == null ||
    (node.getChildrenSize() === 1 &&
      $isTextNode(first) &&
      EMPTY_LINE.test(first.getTextContent()))
  );
}

// `$convertToMarkdownString` treats its node as a container and serializes
// the children as top-level blocks, so passing a block directly yields "".
// Wrap it as the sole child of a root-like node to get the per-block string.
// Relies on createMarkdownExport only reading node.getChildren() on the arg.
function $serializeBlock(block: LexicalNode): string {
  const wrapper = { getChildren: () => [block] } as unknown as ElementNode;
  return $convertToMarkdownString(TRANSFORMERS, wrapper);
}

// Per-block value: the serialized markdown plus the empty-paragraph flag,
// so the separator logic can run in combine without reading live nodes at
// fold time.
interface MarkdownBlock {
  text: string;
  empty: boolean;
}

// Monoid concatenation with createMarkdownExport's separators: double
// newline between two non-empty blocks, single newline otherwise, and no
// separator before the first block (the identity case).
const markdownMonoid: Monoid<MarkdownBlock> = {
  identity: { text: "", empty: true },
  combine: (a, b) => {
    if (a === markdownMonoid.identity) return b;
    if (b === markdownMonoid.identity) return a;
    return {
      text: a.text + (!a.empty && !b.empty ? "\n\n" : "\n") + b.text,
      empty: b.empty,
    };
  },
};

export const markdownFold = new BlockFold<MarkdownBlock>({
  monoid: markdownMonoid,
  compute: (block) => ({
    text: $serializeBlock(block),
    empty: $isEmptyParagraph(block),
  }),
});

/** Convert an EditorState to markdown, using the incremental cache when warm. */
export function editorStateToMarkdown(state: EditorState): string {
  return markdownFold.read(state).text;
}
