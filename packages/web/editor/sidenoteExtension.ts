import { defineExtension } from "@lexical/extension";
import { $isMarkNode } from "@lexical/mark";
import type { Signal } from "@preact/signals";
import type { LexicalEditor } from "lexical";
import type { RangedMark } from "@/signals/marks.ts";
import type { MarkNumbers, SidenotePositions } from "@/signals/sidenotes.ts";
import { MarkNode } from "./markNode.ts";
import { trackNodePositions } from "./trackNodePositions.ts";

interface SidenoteConfig {
  sidenotePositions: Signal<SidenotePositions>;
  markNumbers: Signal<MarkNumbers>;
  ranges: Signal<RangedMark[]>;
}

// Publishes thread_id -> vertical position for every mark, and renders the
// `data-number` superscript on each MarkNode fragment. Zero-length marks
// produce no MarkNode; their position is measured from a collapsed Range at
// their anchor. `mark-active` is owned by MarksAtCursorExtension.
export const SidenoteExtension = defineExtension({
  name: "sidenote",
  afterRegistration: (
    editor: LexicalEditor,
    { sidenotePositions, markNumbers, ranges }: SidenoteConfig,
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
        for (const { el, ids } of fragments) {
          const nums = ids
            .map((id) => numbers.get(id))
            .filter((n): n is number => n !== undefined);
          if (nums.length) el.dataset.number = nums.join(",");
          else delete el.dataset.number;
        }
      },
    });
  },
});
