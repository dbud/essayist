import { defineExtension } from "@lexical/extension";
import { $isMarkNode, MarkNode } from "@lexical/mark";
import type { Signal } from "@preact/signals";
import type { LexicalEditor } from "lexical";
import type { MarkNumbers, SidenotePositions } from "@/signals/sidenotes.ts";
import { trackNodePositions } from "./trackNodePositions.ts";

interface SidenoteConfig {
  sidenotePositions: Signal<SidenotePositions>;
  markNumbers: Signal<MarkNumbers>;
  activeMarkIds: Signal<Set<string>>;
}

// Publishes thread_id -> min MarkNode.offsetTop (so the sidenote column places
// margin notes at the same top), badges every MarkNode fragment with its
// ordinal via `data-number` (CSS renders the superscript), and flags the mark
// under the caret via `data-active`. Re-badges on ordinal or cursor changes.
// Measurement plumbing lives in trackNodePositions.
export const SidenoteExtension = defineExtension({
  name: "sidenote",
  afterRegistration: (
    editor: LexicalEditor,
    { sidenotePositions, markNumbers, activeMarkIds }: SidenoteConfig,
  ) => {
    return trackNodePositions(editor, {
      nodeClass: MarkNode,
      isNode: $isMarkNode,
      getIds: (node) => node.getIDs(),
      output: sidenotePositions,
      remeasureOn: [markNumbers, activeMarkIds],
      onFragments: (fragments) => {
        const numbers = markNumbers.value;
        const active = activeMarkIds.value;
        for (const { el, ids } of fragments) {
          const nums = ids
            .map((id) => numbers.get(id))
            .filter((n): n is number => n !== undefined);
          if (nums.length) el.dataset.number = nums.join(",");
          else delete el.dataset.number;
          if (ids.some((id) => active.has(id))) el.dataset.active = "";
          else delete el.dataset.active;
        }
      },
    });
  },
});
