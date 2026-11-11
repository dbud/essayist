import type { Mark } from "@essayist/core";
import { defineExtension } from "@lexical/extension";
import { $isMarkNode, MarkNode } from "@lexical/mark";
import type { ReadonlySignal, Signal } from "@preact/signals";
import { equal } from "@std/assert/equal";
import type { LexicalEditor, NodeKey } from "lexical";
import { $getNodeByKey, $getRoot, mergeRegister } from "lexical";

import type { MarkedBlock } from "#/geometry/layout.ts";
import type { Categories } from "#/models/categories.ts";
import type {
  MarkFragmentBadge,
  MarkBlocks,
  MarkedBlocks,
  MarkOrdinals,
  MarkFragmentRect,
  SidenotePositions,
} from "#/models/sidenotes.ts";
import { editorStateToMarkdown } from "#/utils/markdown.ts";

import { $badgeBlockOf, $marginBlockOf } from "./blocks.ts";
import { getMeasureContext, textPointTop } from "./domMeasure.ts";
import { assignBands } from "./markColors.ts";
import { computeMarkFragmentBadges } from "./markFragmentBadges.ts";
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

// A zero-length mark's anchor: the TextNode key the mark points into and its measured line top in
// editor-column coordinates. `top` is null when the point has no box; the key still feeds block
// resolution then.
interface ZeroLengthMarkAnchor {
  id: string;
  key: NodeKey;
  top: number | null;
}

interface SidenoteConfig {
  sidenotePositions: Signal<SidenotePositions>;
  markOrdinals: Signal<MarkOrdinals>;
  markFragmentBadges: Signal<MarkFragmentBadge[]>;
  markFragmentRects: Signal<MarkFragmentRect[]>;
  markedBlocks: Signal<MarkedBlocks>;
  markBlocks: Signal<MarkBlocks>;
  resolved: ReadonlySignal<readonly Mark[]>;
  categories: Categories;
  fonts: ReadonlyArray<Signal<string>>;
}

const inlineMargin = (el: HTMLElement): number => Number.parseFloat(el.style.marginTop) || 0;

// Publishes mark positions, badges, rect highlights, and marked-block geometry for the sidenote
// column.
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
      markBlocks,
      resolved,
      categories,
      fonts,
    }: SidenoteConfig,
  ) => {
    const measure = () => {
      const marks = resolved.value;
      const ctx = getMeasureContext(editor.getRootElement());

      // Zero-length marks wrap no text and produce no MarkNode, so measure them from a collapsed
      // Range at their anchor. Resolve the anchor against the fresh committed tree (not a lagging
      // signal) so the position tracks the live editor; skip the work when there are no zero-length
      // marks.
      const anchors: ZeroLengthMarkAnchor[] = [];
      if (marks.some((m) => m.length === 0)) {
        const state = editor.getEditorState();
        const content = editorStateToMarkdown(state);
        let spans: TextNodeSpan[] = [];
        let fallbackKey = "";
        state.read(() => {
          spans = $collectTextNodeSpans(content);
          if (spans.length === 0)
            fallbackKey = $getRoot().getFirstChild()?.getKey() ?? $getRoot().getKey();
        });
        for (const m of marks) {
          if (m.length !== 0) continue;
          const pos = findPosition(spans, m.offset);
          const key = pos?.key ?? fallbackKey;
          const el = editor.getElementByKey(key);
          anchors.push({
            id: m.thread_id,
            key,
            top: el !== null && ctx !== null ? textPointTop(ctx, el, pos?.offset ?? 0) : null,
          });
        }
      }

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
      // Key order follows the tracker's creation, not the document; fragments are canonically
      // document-ordered here, which the badge rule relies on.
      const fragments = collected.toSorted(byDocumentPosition);

      // A mark spanning a paragraph break yields several fragments sharing its ids; the minimum top
      // aligns to the mark's first line.
      const tops = new Map<string, number>();
      for (const { ids, top } of fragments) {
        for (const id of ids) {
          const prev = tops.get(id);
          if (prev === undefined || top < prev) tops.set(id, top);
        }
      }
      for (const { id, top } of anchors) {
        if (top !== null && !tops.has(id)) tops.set(id, top);
      }
      if (!equal(sidenotePositions.value, tops)) sidenotePositions.value = tops;

      const ordinals = markOrdinals.value;
      if (ctx === null) {
        if (markFragmentBadges.value.length > 0) markFragmentBadges.value = [];
        if (markFragmentRects.value.length > 0) markFragmentRects.value = [];
        if (markedBlocks.value.size > 0) markedBlocks.value = new Map();
        if (markBlocks.value.size > 0) markBlocks.value = new Map();
        return;
      }
      const { containerRect } = ctx;
      // Badges are overlay chips positioned here (not ::after on the mark) so that caret movement
      // and deletion at the mark boundary don't interfere with them.
      markFragmentBadges.value = computeMarkFragmentBadges(fragments, ordinals, ctx);

      const marksById = new Map(marks.map((m) => [m.thread_id, m] as const));
      const rects: MarkFragmentRect[] = [];
      for (const { el, ids } of fragments) {
        const bands = assignBands(marksById, ids, categories);
        const bandCount = bands.length;
        if (bandCount > 0) {
          for (const rect of el.getClientRects()) {
            const left = rect.left - containerRect.left;
            const top = rect.top - containerRect.top;
            const width = rect.width;
            const height = rect.height;
            for (const { id, color, order } of bands) {
              rects.push({ id, color, left, top, width, height, order, bandCount });
            }
          }
        }
      }
      markFragmentRects.value = rects;

      const blocks = new Map<NodeKey, MarkedBlock>();
      const byThread = new Map<string, NodeKey>();
      editor.getEditorState().read(() => {
        const place = (key: NodeKey, ids: readonly string[]) => {
          const blockKey = $marginBlockOf(key);
          if (blockKey === null) return;
          if (blocks.has(blockKey)) {
            for (const id of ids) byThread.set(id, blockKey);
            return;
          }
          const el = editor.getElementByKey(blockKey);
          if (el === null) return;
          blocks.set(blockKey, {
            top: el.offsetTop,
            height: el.offsetHeight,
            margin: inlineMargin(el),
          });
          for (const id of ids) byThread.set(id, blockKey);
        };
        for (const { ids, key } of fragments) place(key, ids);
        for (const { id, key } of anchors) place(key, [id]);
      });
      if (!equal(markedBlocks.value, blocks)) markedBlocks.value = blocks;
      if (!equal(markBlocks.value, byThread)) markBlocks.value = byThread;
    };

    const [schedule, disposeRafScheduler] = createRafScheduler(measure);

    sidenotePositions.value = new Map();

    const [nodeKeys, disposeTrackNodeKeys] = trackNodeKeys(editor, MarkNode, schedule);

    // Never re-measure on scroll: offsetTop is stable under scroll, and fragments are inline,
    // so repositioning them never resizes the observed root, which keeps the resize trigger from
    // looping.
    return mergeRegister(
      registerResizeObserver(editor, schedule),
      disposeTrackNodeKeys,
      editor.registerUpdateListener(schedule),
      registerFontLoadObserver(schedule),
      registerSignalsObserver([resolved, categories.byLabel, ...fonts], schedule),
      disposeRafScheduler,
    );
  },
});

// Document-order comparator for fragments, by their elements' DOM position.
function byDocumentPosition(a: MarkFragment, b: MarkFragment): number {
  if (a.el === b.el) return 0;
  return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
