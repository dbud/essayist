import { defineExtension } from "@lexical/extension";
import { $isMarkNode, MarkNode } from "@lexical/mark";
import type { Signal } from "@preact/signals";
import type { LexicalEditor } from "lexical";
import type { RangedMark } from "@/signals/marks.ts";
import type { MarkNumbers, SidenotePositions } from "@/signals/sidenotes.ts";
import { trackNodePositions } from "./trackNodePositions.ts";

interface SidenoteConfig {
  sidenotePositions: Signal<SidenotePositions>;
  markNumbers: Signal<MarkNumbers>;
  activeMarkIds: Signal<Set<string>>;
  ranges: Signal<RangedMark[]>;
}

// Publishes thread_id -> vertical position for every mark. Marks with a
// non-empty span are tracked as MarkNode fragments (offsetTop + a `data-number`
// superscript + a `mark-active` class under the caret). Zero-length marks
// (e.g. stale ones) wrap no text and produce no MarkNode, so their position is
// measured from a collapsed Range at their anchor (see trackNodePositions);
// they get no in-editor badge but still render in the sidenote column.
// Re-badges/re-measures on ordinal, cursor, or range changes.
export const SidenoteExtension = defineExtension({
  name: "sidenote",
  afterRegistration: (
    editor: LexicalEditor,
    { sidenotePositions, markNumbers, activeMarkIds, ranges }: SidenoteConfig,
  ) => {
    return trackNodePositions(editor, {
      nodeClass: MarkNode,
      isNode: $isMarkNode,
      getIds: (node) => node.getIDs(),
      output: sidenotePositions,
      remeasureOn: [markNumbers, activeMarkIds, ranges],
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
        const active = activeMarkIds.value;
        for (const { el, ids } of fragments) {
          const nums = ids
            .map((id) => numbers.get(id))
            .filter((n): n is number => n !== undefined);
          if (nums.length) el.dataset.number = nums.join(",");
          else delete el.dataset.number;
          el.classList.toggle(
            "mark-active",
            ids.some((id) => active.has(id)),
          );
        }
      },
    });
  },
});
