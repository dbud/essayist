import type { Mark } from "@essayist/core";
import { defineExtension } from "@lexical/extension";
import { $isMarkNode, MarkNode } from "@lexical/mark";
import type { ReadonlySignal, Signal } from "@preact/signals";
import { equal } from "@std/assert/equal";
import type { LexicalEditor, NodeKey } from "lexical";
import { $getNodeByKey, $getRoot, mergeRegister } from "lexical";

import type { MarkedBlock } from "#/geometry/layout.ts";
import { markTops } from "#/geometry/tops.ts";
import type {
  MarkFragmentBadge,
  MarkedBlockKeys,
  MarkOrdinals,
  MarkFragmentRect,
  SidenotePositions,
} from "#/models/sidenotes.ts";
import { editorStateToMarkdown } from "#/utils/markdown.ts";

import { $badgeBlockOf, $marginBlockOf } from "./blocks.ts";
import { getMeasureContext, textPointTop, type MeasureContext } from "./domMeasure.ts";
import { computeMarkFragmentBadges } from "./markFragmentBadges.ts";
import { computeMarkFragmentRects } from "./markFragmentRects.ts";
import {
  createRafScheduler,
  registerFontLoadObserver,
  registerResizeObserver,
  registerSignalsObserver,
} from "./observers.ts";
import { $collectTextNodeSpans, findPosition, type TextNodeSpan } from "./textNodeSpans.ts";
import { trackNodeKeys } from "./trackNodeKeys.ts";

export interface MarkFragment {
  el: HTMLElement;
  ids: string[];
  top: number;
  key: NodeKey;
  badgeBlockKey: NodeKey; // this fragment's visual container, per $badgeBlockOf
}

interface ZeroLengthMarkAnchor {
  id: string;
  key: NodeKey;
  top: number;
}

interface SidenoteConfig {
  sidenotePositions: Signal<SidenotePositions>;
  markOrdinals: Signal<MarkOrdinals>;
  markFragmentBadges: Signal<MarkFragmentBadge[]>;
  markFragmentRects: Signal<MarkFragmentRect[]>;
  markedBlocks: Signal<MarkedBlock[]>;
  markedBlockKeys: Signal<MarkedBlockKeys>;
  resolved: ReadonlySignal<readonly Mark[]>;
  fonts: ReadonlyArray<Signal<string>>;
}

const inlineMargin = (el: HTMLElement): number => Number.parseFloat(el.style.marginTop) || 0;

export const SidenoteExtension = defineExtension({
  name: "sidenote",
  afterRegistration: (
    editor: LexicalEditor,
    {
      sidenotePositions,
      markOrdinals,
      markFragmentBadges,
      markFragmentRects,
      markedBlocks,
      markedBlockKeys,
      resolved,
      fonts,
    }: SidenoteConfig,
  ) => {
    const measure = () => {
      const marks = resolved.value;
      const ctx = getMeasureContext(editor.getRootElement());
      // A pass that cannot measure retracts every measured publication.
      if (ctx === null) {
        if (sidenotePositions.value.size > 0) sidenotePositions.value = new Map();
        if (markFragmentBadges.value.length > 0) markFragmentBadges.value = [];
        if (markFragmentRects.value.length > 0) markFragmentRects.value = [];
        if (markedBlocks.value.length > 0) markedBlocks.value = [];
        if (markedBlockKeys.value.size > 0) markedBlockKeys.value = new Map();
        return;
      }

      const anchors = collectAnchors(
        editor,
        ctx,
        marks.filter((m) => m.length === 0),
      );
      const fragments = collectFragments(editor, nodeKeys);

      const tops = markTops(fragments, anchors);
      if (!equal(sidenotePositions.value, tops)) sidenotePositions.value = tops;

      const ordinals = markOrdinals.value;
      markFragmentBadges.value = computeMarkFragmentBadges(fragments, ordinals, ctx);
      markFragmentRects.value = computeMarkFragmentRects(fragments, ctx);

      const [blocks, blocksByThread] = collectBlocks(editor, fragments, anchors);
      if (!equal(markedBlocks.value, blocks)) markedBlocks.value = blocks;
      if (!equal(markedBlockKeys.value, blocksByThread)) markedBlockKeys.value = blocksByThread;
    };

    const [schedule, disposeRafScheduler] = createRafScheduler(measure);

    sidenotePositions.value = new Map();

    const [nodeKeys, disposeTrackNodeKeys] = trackNodeKeys(editor, MarkNode, schedule);

    return mergeRegister(
      registerResizeObserver(editor, schedule),
      disposeTrackNodeKeys,
      editor.registerUpdateListener(schedule),
      registerFontLoadObserver(schedule),
      registerSignalsObserver([resolved, ...fonts], schedule),
      disposeRafScheduler,
    );
  },
});

// Document-order comparator for fragments, by their elements' DOM position.
function byDocumentPosition(a: MarkFragment, b: MarkFragment): number {
  if (a.el === b.el) return 0;
  return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function collectAnchors(
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
    anchors.push({ id: m.thread_id, key, top });
  }
  return anchors;
}

function collectFragments(editor: LexicalEditor, nodeKeys: ReadonlySet<NodeKey>): MarkFragment[] {
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
 * The geometry of every marked block (inline margins included) and, per thread, the block key its
 * fragments resolve to. Fragments and anchors arrive in document order, so the pairing keeps each
 * mark's last block; several marks can share one block, so blocks dedup per key.
 */
function collectBlocks(
  editor: LexicalEditor,
  fragments: ReadonlyArray<MarkFragment>,
  anchors: ReadonlyArray<ZeroLengthMarkAnchor>,
): [MarkedBlock[], MarkedBlockKeys] {
  const blocksByKey = new Map<NodeKey, MarkedBlock>();
  const byThread = new Map<string, NodeKey>();
  editor.getEditorState().read(() => {
    const place = (key: NodeKey, ids: readonly string[]) => {
      const blockKey = $marginBlockOf(key);
      if (blockKey === null) return;
      if (blocksByKey.has(blockKey)) {
        for (const id of ids) byThread.set(id, blockKey);
        return;
      }
      const el = editor.getElementByKey(blockKey);
      if (el === null) return;
      blocksByKey.set(blockKey, {
        key: blockKey,
        top: el.offsetTop,
        height: el.offsetHeight,
        margin: inlineMargin(el),
      });
      for (const id of ids) byThread.set(id, blockKey);
    };
    for (const { ids, key } of fragments) place(key, ids);
    for (const { id, key } of anchors) place(key, [id]);
  });
  return [[...blocksByKey.values()], byThread];
}
