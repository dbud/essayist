import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import {
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  type EditorState,
  type ElementNode,
  type LexicalNode,
  type NodeKey,
} from "lexical";

interface CachedDoc {
  parts: Map<NodeKey, string>;
  markdown: string;
}

const cache = new WeakMap<EditorState, CachedDoc>();

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

// Rejoin per-block strings with createMarkdownExport's separators: double
// newline between two non-empty paragraphs, single newline otherwise.
function joinBlocks(
  children: LexicalNode[],
  parts: Map<NodeKey, string>,
): string {
  const out: string[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const raw = parts.get(child.getKey());
    if (raw == null) continue;
    if (
      i > 0 &&
      !$isEmptyParagraph(child) &&
      !$isEmptyParagraph(children[i - 1])
    ) {
      out.push(`\n${raw}`);
    } else {
      out.push(raw);
    }
  }
  return out.join("\n");
}

// Key of the top-level block containing `node` (null for root/detached).
function topLevelAncestorKey(node: LexicalNode | null): NodeKey | null {
  return node?.getTopLevelElement()?.getKey() ?? null;
}

function fullSerialize(state: EditorState): CachedDoc {
  let parts = new Map<NodeKey, string>();
  let markdown = "";
  state.read(() => {
    const children = $getRoot().getChildren();
    parts = new Map();
    for (const child of children)
      parts.set(child.getKey(), $serializeBlock(child));
    markdown = joinBlocks(children, parts);
  });
  return { parts, markdown };
}

/** Convert an EditorState to markdown, using the incremental cache when warm. */
export function editorStateToMarkdown(state: EditorState): string {
  return cache.getOrInsertComputed(state, fullSerialize).markdown;
}

/**
 * Incrementally update the cache from `prev` to `next`, re-serializing only
 * the dirty top-level blocks. Call within the editor update cycle; reads
 * `next` to resolve live node keys.
 */
export function cacheMarkdownUpdate(
  next: EditorState,
  prev: EditorState,
  dirtyElements: Map<NodeKey, boolean>,
  dirtyLeaves: Set<NodeKey>,
): void {
  if (cache.has(next)) return;
  const prevDoc = cache.get(prev);
  if (!prevDoc) {
    cache.set(next, fullSerialize(next));
    return;
  }

  next.read(() => {
    const children = $getRoot().getChildren();
    const newKeys = new Set(children.map((child) => child.getKey()));

    const parts = new Map(prevDoc.parts);

    // Re-serialize blocks containing a dirty node, plus any new block.
    // `dirtyLeaves` is needed for top-level decorator mutations (e.g. HR),
    // whose key lands in dirtyLeaves, not dirtyElements.
    const dirtyTop = new Set<NodeKey>();
    for (const key of dirtyElements.keys()) {
      const top = topLevelAncestorKey($getNodeByKey(key));
      if (top) dirtyTop.add(top);
    }
    for (const key of dirtyLeaves) {
      const top = topLevelAncestorKey($getNodeByKey(key));
      if (top) dirtyTop.add(top);
    }
    for (const key of newKeys) {
      if (!parts.has(key)) dirtyTop.add(key);
    }

    for (const key of dirtyTop) {
      const node = $getNodeByKey(key);
      if (!node || !newKeys.has(key)) {
        parts.delete(key);
      } else {
        parts.set(key, $serializeBlock(node));
      }
    }
    for (const key of parts.keys()) {
      if (!newKeys.has(key)) parts.delete(key);
    }

    cache.set(next, { parts, markdown: joinBlocks(children, parts) });
  });
}
