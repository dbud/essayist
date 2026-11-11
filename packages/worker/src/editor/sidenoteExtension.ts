import type { Mark } from "@essayist/core";
import { defineExtension } from "@lexical/extension";
import { $isMarkNode, MarkNode } from "@lexical/mark";
import type { ReadonlySignal, Signal } from "@preact/signals";
import { equal } from "@std/assert/equal";
import type { LexicalEditor, LexicalNode, NodeKey } from "lexical";
import { $getNodeByKey, $getRoot } from "lexical";

import type { MarkedBlock } from "#/geometry/layout.ts";
import type { Categories } from "#/models/categories.ts";
import type {
  MarkBadge,
  MarkBlocks,
  MarkedBlocks,
  MarkNumbers,
  MarkRect,
  SidenotePositions,
} from "#/models/sidenotes.ts";
import { editorStateToMarkdown } from "#/utils/markdown.ts";

import { $leafBlockOf } from "./blocks.ts";
import { getMeasureContext } from "./domMeasure.ts";
import { computeMarkBadges } from "./markBadges.ts";
import { assignBands } from "./markColors.ts";
import { $collectTextNodeSpans, findPosition, type TextNodeSpan } from "./textNodeSpans.ts";
import { trackEverything } from "./trackEverything.ts";

interface SidenoteConfig {
  sidenotePositions: Signal<SidenotePositions>;
  markNumbers: Signal<MarkNumbers>;
  markBadges: Signal<MarkBadge[]>;
  markRects: Signal<MarkRect[]>;
  markedBlocks: Signal<MarkedBlocks>;
  markBlocks: Signal<MarkBlocks>;
  resolved: ReadonlySignal<readonly Mark[]>;
  categories: Categories;
  fonts: ReadonlyArray<Signal<string>>;
}

const inlineMargin = (el: HTMLElement): number => Number.parseFloat(el.style.marginTop) || 0;

// Publishes mark positions and ordinal badges. Non-empty marks are tracked as MarkNode fragments
// (offsetTop); zero-length marks produce no MarkNode and are measured from a collapsed Range at
// their anchor. Badges are overlay positions (not ::after on the mark) so they don't interfere with
// caret/ deletion at the mark boundary.
export const SidenoteExtension = defineExtension({
  name: "sidenote",
  afterRegistration: (
    editor: LexicalEditor,
    {
      sidenotePositions,
      markNumbers,
      markBadges,
      markRects,
      markedBlocks,
      markBlocks,
      resolved,
      categories,
      fonts,
    }: SidenoteConfig,
  ) => {
    return trackEverything(editor, {
      nodeClass: MarkNode,
      isNode: $isMarkNode,
      getIds: (node) => node.getIDs(),
      output: sidenotePositions,
      remeasureOn: [markNumbers, categories.byLabel, ...fonts],
      // Zero-length marks wrap no text and produce no MarkNode, so measure them from a collapsed
      // Range at their anchor. Resolve the anchor against the fresh committed tree (not a lagging
      // signal) so the position tracks the live editor; short-circuit when there are no zero-length
      // marks to skip the span collection. Runs in the rAF-deferred `measure()` callback.
      points: () => {
        const marks = resolved.value;
        if (!marks.some((m) => m.length === 0)) return [];
        const state = editor.getEditorState();
        const content = editorStateToMarkdown(state);
        let spans: TextNodeSpan[] = [];
        let fallbackKey = "";
        state.read(() => {
          spans = $collectTextNodeSpans(content);
          if (spans.length === 0)
            fallbackKey = $getRoot().getFirstChild()?.getKey() ?? $getRoot().getKey();
        });
        return marks
          .filter((m) => m.length === 0)
          .map((m) => {
            const pos = findPosition(spans, m.offset);
            return {
              id: m.thread_id,
              key: pos?.key ?? fallbackKey,
              offset: pos?.offset ?? 0,
            };
          });
      },
      onFragments: (fragments, points) => {
        const numbers = markNumbers.value;
        const ctx = getMeasureContext(editor.getRootElement());
        if (ctx === null) {
          if (markBadges.value.length > 0) markBadges.value = [];
          if (markRects.value.length > 0) markRects.value = [];
          if (markedBlocks.value.size > 0) markedBlocks.value = new Map();
          if (markBlocks.value.size > 0) markBlocks.value = new Map();
          return;
        }
        const { containerRect } = ctx;
        markBadges.value = computeMarkBadges(fragments, numbers, editor, ctx);

        const marksById = new Map(resolved.value.map((m) => [m.thread_id, m] as const));
        const rects: MarkRect[] = [];
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
        markRects.value = rects;

        const blocks = new Map<NodeKey, MarkedBlock>();
        const byThread = new Map<string, NodeKey>();
        editor.getEditorState().read(() => {
          const place = (node: LexicalNode | null, ids: readonly string[]) => {
            const block = $leafBlockOf(node);
            if (block === null) return;
            const key = block.getKey();
            if (blocks.has(key)) {
              for (const id of ids) byThread.set(id, key);
              return;
            }
            const el = editor.getElementByKey(key);
            if (el === null) return;
            blocks.set(key, {
              top: el.offsetTop,
              height: el.offsetHeight,
              margin: inlineMargin(el),
            });
            for (const id of ids) byThread.set(id, key);
          };
          for (const { ids, key } of fragments) place($getNodeByKey(key), ids);
          for (const { id, key } of points) place($getNodeByKey(key), [id]);
        });
        if (!equal(markedBlocks.value, blocks)) markedBlocks.value = blocks;
        if (!equal(markBlocks.value, byThread)) markBlocks.value = byThread;
      },
    });
  },
});
