import type { Mark } from "@essayist/core";
import { $isMarkNode } from "@lexical/mark";
import type { LexicalEditor, NodeKey } from "lexical";
import { $getNodeByKey, $getRoot } from "lexical";

import type { MarkedBlock } from "#/geometry/layout.ts";
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
  marginBlockKey: NodeKey | null; // the block $marginBlockOf would push, null outside any block
}

export interface ZeroLengthMarkAnchor {
  id: string;
  key: NodeKey;
  top: number;
  marginBlockKey: NodeKey | null;
}

const inlineMargin = (el: HTMLElement): number => Number.parseFloat(el.style.marginTop) || 0;

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
  for (const m of zeroMarks) {
    const pos = findPosition(spans, m.offset);
    const key = pos?.key ?? fallbackKey;
    const el = editor.getElementByKey(key);
    if (el === null) continue;
    const top = textPointTop(ctx, el, pos?.offset ?? 0);
    if (top === null) continue;
    anchors.push({
      id: m.thread_id,
      key,
      top,
      marginBlockKey: $marginBlockOf(key),
    });
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
        marginBlockKey: $marginBlockOf(key),
      });
    }
  });
  return collected.toSorted(byDocumentPosition);
}

/**
 * The geometry of every marked block (inline margins included). Several marks can share one block,
 * and one multi-paragraph mark visits several of its blocks, so records dedup per key.
 */
export function collectBlocks(
  editor: LexicalEditor,
  fragments: ReadonlyArray<MarkFragment>,
  anchors: ReadonlyArray<ZeroLengthMarkAnchor>,
): MarkedBlock[] {
  const blocksByKey = new Map<NodeKey, MarkedBlock>();
  editor.getEditorState().read(() => {
    const place = (marginBlockKey: NodeKey | null) => {
      if (marginBlockKey === null) return;
      if (blocksByKey.has(marginBlockKey)) return;
      const el = editor.getElementByKey(marginBlockKey);
      if (el === null) return;
      blocksByKey.set(marginBlockKey, {
        key: marginBlockKey,
        top: el.offsetTop,
        height: el.offsetHeight,
        margin: inlineMargin(el),
      });
    };
    for (const { marginBlockKey } of fragments) place(marginBlockKey);
    for (const { marginBlockKey } of anchors) place(marginBlockKey);
  });
  return [...blocksByKey.values()];
}
