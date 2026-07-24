import { defineExtension } from "@lexical/extension";
import { $isMarkNode, MarkNode } from "@lexical/mark";
import type { Signal } from "@preact/signals";
import type { LexicalEditor } from "lexical";
import type { MarkNumbers, SidenotePositions } from "@/signals/sidenotes.ts";
import { trackNodePositions } from "./trackNodePositions.ts";

interface SidenotePositionsConfig {
  sidenotePositions: Signal<SidenotePositions>;
  markNumbers: Signal<MarkNumbers>;
}

// Publishes thread_id -> min MarkNode.offsetTop (so the sidenote column places
// margin notes at the same top), and badges every MarkNode fragment with its
// ordinal via `data-number` (CSS renders the superscript). Re-badges when
// ordinals change. Measurement plumbing lives in trackNodePositions.
export const SidenotePositionsExtension = defineExtension({
  name: "sidenote-positions",
  afterRegistration: (
    editor: LexicalEditor,
    { sidenotePositions, markNumbers }: SidenotePositionsConfig,
  ) => {
    return trackNodePositions(editor, {
      nodeClass: MarkNode,
      isNode: $isMarkNode,
      getIds: (node) => node.getIDs(),
      output: sidenotePositions,
      remeasureOn: [markNumbers],
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
