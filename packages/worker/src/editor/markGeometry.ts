import type { Mark } from "@essayist/core";
import { $isMarkNode } from "@lexical/mark";
import type { LexicalEditor, NodeKey } from "lexical";
import { $getNodeByKey, $getRoot } from "lexical";

import type { MeasuredBlock } from "#/geometry/layout.ts";
import { editorStateToMarkdown } from "#/utils/markdown.ts";

import { $badgeBlockOf, $marginBlockOf } from "./blocks.ts";
import { textPointTop, type MeasureContext } from "./domMeasure.ts";
import { $collectTextNodeSpans, findPosition, type TextNodeSpan } from "./textNodeSpans.ts";

export interface MarkFragment {
  el: HTMLElement;
  ids: string[];
  top: number;
  key: NodeKey;
  badgeBlockKey: NodeKey; // this fragment's visual container, per $badgeBlockOf
}

export interface ZeroLengthMarkAnchor {
  id: string;
  key: NodeKey;
  top: number;
}

const beforeSpacer = (el: HTMLElement): number =>
  Number.parseFloat(el.style.getPropertyValue("--block-spacer-before")) || 0;
const afterSpacer = (el: HTMLElement): number =>
  Number.parseFloat(el.style.getPropertyValue("--block-spacer-after")) || 0;

// Document-order comparator for fragments, by their elements' DOM position.
function byDocumentPosition(a: MarkFragment, b: MarkFragment): number {
  if (a.el === b.el) return 0;
  return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

export function collectAnchors(
  editor: LexicalEditor,
  ctx: MeasureContext,
  zeroMarks: ReadonlyArray<Mark>,
): ZeroLengthMarkAnchor[] {
  if (zeroMarks.length === 0) return [];
  const state = editor.getEditorState();
  const content = editorStateToMarkdown(state);
  let spans: TextNodeSpan[] = [];
  // An empty file anchors its zero-length marks at the first block.
  let fallbackKey = "";
  state.read(() => {
    spans = $collectTextNodeSpans(content);
    if (spans.length === 0)
      fallbackKey = $getRoot().getFirstChild()?.getKey() ?? $getRoot().getKey();
  });
  const anchors: ZeroLengthMarkAnchor[] = [];
  for (const { id, offset } of zeroMarks) {
    const pos = findPosition(spans, offset);
    const key = pos?.key ?? fallbackKey;
    const el = editor.getElementByKey(key);
    if (el === null) continue;
    const top = textPointTop(ctx, el, pos?.offset ?? 0);
    if (top === null) continue;
    anchors.push({ id, key, top });
  }
  return anchors;
}

export function collectFragments(
  editor: LexicalEditor,
  nodeKeys: ReadonlySet<NodeKey>,
): MarkFragment[] {
  const collected: MarkFragment[] = [];
  editor.getEditorState().read(() => {
    for (const key of nodeKeys) {
      const node = $getNodeByKey(key);
      if (!$isMarkNode(node)) continue;
      const el = editor.getElementByKey(key);
      if (el === null) continue;
      collected.push({
        el,
        ids: node.getIDs(),
        top: el.offsetTop,
        key,
        badgeBlockKey: $badgeBlockOf(key),
      });
    }
  });
  return collected.toSorted(byDocumentPosition);
}

/**
 * The measured blocks (spacer heights included), each carrying the marks paired to it: per mark,
 * the block of its top-most line; the mark rows supply the offset. Blocks order by ascending top,
 * each block's marks by top with the document offset, then id. Block records dedup per key; a mark
 * with no resolvable block stays block-free.
 */
export function collectBlocks(
  editor: LexicalEditor,
  fragments: ReadonlyArray<MarkFragment>,
  anchors: ReadonlyArray<ZeroLengthMarkAnchor>,
  marks: ReadonlyArray<Mark>,
): MeasuredBlock[] {
  const blocksByKey = new Map<NodeKey, Omit<MeasuredBlock, "marks">>();
  // mark id -> top-most block, with its line top and the mark's offset.
  const pairs = new Map<string, { top: number; offset: number; blockKey: NodeKey }>();
  const offsets = new Map(marks.map(({ id, offset }) => [id, offset]));
  editor.getEditorState().read(() => {
    const place = (ids: readonly string[], key: NodeKey, top: number) => {
      const blockKey = $marginBlockOf(key);
      if (blockKey === null) return;
      if (!blocksByKey.has(blockKey)) {
        const el = editor.getElementByKey(blockKey);
        if (el === null) return;
        blocksByKey.set(blockKey, {
          key: blockKey,
          top: el.offsetTop,
          height: el.offsetHeight,
          before: beforeSpacer(el),
          after: afterSpacer(el),
        });
      }
      for (const id of ids) {
        const prev = pairs.get(id);
        if (prev === undefined || top < prev.top) {
          pairs.set(id, { top, offset: offsets.get(id) ?? 0, blockKey });
        }
      }
    };
    for (const { ids, key, top } of fragments) place(ids, key, top);
    for (const { id, key, top } of anchors) place([id], key, top);
  });
  const marksByBlock = new Map<NodeKey, { id: string; top: number; offset: number }[]>();
  for (const [id, { top, offset, blockKey }] of pairs) {
    marksByBlock.getOrInsert(blockKey, []).push({ id, top, offset });
  }
  return [...blocksByKey.values()]
    .toSorted((a, b) => a.top - b.top)
    .map((block) => ({
      ...block,
      marks: (marksByBlock.get(block.key) ?? [])
        .toSorted((a, b) => a.top - b.top || a.offset - b.offset || (a.id < b.id ? -1 : 1))
        .map(({ id, top }) => ({ id, top })),
    }));
}
