import type { Mark } from "@essayist/core";
import { defineExtension } from "@lexical/extension";
import { $isMarkNode } from "@lexical/mark";
import type { Signal } from "@preact/signals";
import type { LexicalEditor } from "lexical";
import { $getRoot } from "lexical";
import type {
  MarkBadge,
  MarkNumbers,
  SidenotePositions,
} from "@/signals/sidenotes.ts";
import { editorStateToMarkdown } from "@/utils/markdown.ts";
import { contentEndRect, getMeasureContext, hasRect } from "./domMeasure.ts";
import { MarkNode } from "./markNode.ts";
import {
  $collectTextNodeSpans,
  findPosition,
  type TextNodeSpan,
} from "./textNodeSpans.ts";
import { trackNodePositions } from "./trackNodePositions.ts";

interface SidenoteConfig {
  sidenotePositions: Signal<SidenotePositions>;
  markNumbers: Signal<MarkNumbers>;
  markBadges: Signal<MarkBadge[]>;
  resolved: Signal<Mark[]>;
}

// Publishes mark positions and ordinal badges. Non-empty marks are tracked
// as MarkNode fragments (offsetTop); zero-length marks produce no MarkNode and
// are measured from a collapsed Range at their anchor. Badges are overlay
// positions (not ::after on the mark) so they don't interfere with caret/
// deletion at the mark boundary.
export const SidenoteExtension = defineExtension({
  name: "sidenote",
  afterRegistration: (
    editor: LexicalEditor,
    { sidenotePositions, markNumbers, markBadges, resolved }: SidenoteConfig,
  ) => {
    return trackNodePositions(editor, {
      nodeClass: MarkNode,
      isNode: $isMarkNode,
      getIds: (node) => node.getIDs(),
      output: sidenotePositions,
      remeasureOn: [markNumbers],
      // Zero-length marks wrap no text and produce no MarkNode, so measure them
      // from a collapsed Range at their anchor. Resolve the anchor against the
      // fresh committed tree (not a lagging signal) so the position tracks the
      // live editor; short-circuit when there are no zero-length marks to skip
      // the span collection. Runs in the rAF-deferred `measure()` callback.
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
            fallbackKey =
              $getRoot().getFirstChild()?.getKey() ?? $getRoot().getKey();
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
      onFragments: (fragments) => {
        const numbers = markNumbers.value;
        const ctx = getMeasureContext(editor.getRootElement());
        if (ctx === null) {
          if (markBadges.value.length > 0) markBadges.value = [];
          return;
        }
        const { containerRect, doc } = ctx;
        const badges: MarkBadge[] = [];
        for (const { el, ids, key } of fragments) {
          const nums = ids
            .map((id) => numbers.get(id))
            .filter((n): n is number => n !== undefined);
          if (nums.length === 0) continue;
          const rect = contentEndRect(el, doc);
          if (!hasRect(rect)) continue;
          badges.push({
            key,
            left: rect.right - containerRect.left,
            top: rect.top - containerRect.top,
            numbers: nums.sort((a, b) => a - b),
          });
        }
        markBadges.value = badges;
      },
    });
  },
});
