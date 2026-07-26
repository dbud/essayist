import { defineExtension } from "@lexical/extension";
import { $isMarkNode } from "@lexical/mark";
import type { Signal } from "@preact/signals";
import type { LexicalEditor } from "lexical";
import type { RangedMark } from "@/signals/marks.ts";
import type {
  MarkBadge,
  MarkNumbers,
  SidenotePositions,
} from "@/signals/sidenotes.ts";
import { contentEndRect, getMeasureContext, hasRect } from "./domMeasure.ts";
import { MarkNode } from "./markNode.ts";
import { trackNodePositions } from "./trackNodePositions.ts";

interface SidenoteConfig {
  sidenotePositions: Signal<SidenotePositions>;
  markNumbers: Signal<MarkNumbers>;
  markBadges: Signal<MarkBadge[]>;
  ranges: Signal<RangedMark[]>;
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
    { sidenotePositions, markNumbers, markBadges, ranges }: SidenoteConfig,
  ) => {
    return trackNodePositions(editor, {
      nodeClass: MarkNode,
      isNode: $isMarkNode,
      getIds: (node) => node.getIDs(),
      output: sidenotePositions,
      remeasureOn: [markNumbers, ranges],
      points: () =>
        ranges.value
          .filter(({ mark }) => mark.length === 0) // no MarkNode
          .map(({ mark, range }) => ({
            id: mark.thread_id,
            key: range.anchor.key,
            offset: range.anchor.offset,
          })),
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
            label: nums.join(","),
          });
        }
        markBadges.value = badges;
      },
    });
  },
});
