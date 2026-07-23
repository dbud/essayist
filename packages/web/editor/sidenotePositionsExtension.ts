import { defineExtension } from "@lexical/extension";
import { $isMarkNode, MarkNode } from "@lexical/mark";
import type { Signal } from "@preact/signals";
import {
  $getNodeByKey,
  type LexicalEditor,
  mergeRegister,
  type NodeKey,
} from "lexical";
import type { SidenotePositions } from "@/signals/sidenotePositions.ts";

interface SidenotePositionsConfig {
  sidenotePositions: Signal<SidenotePositions>;
}

// Publishes thread_id -> MarkNode.offsetTop (relative to the editor column,
// its offsetParent) so the sidenote column can place margin notes at the same
// top. Measured on update + reflow -- never on scroll, since offsetTop is
// stable under scroll. A mark spanning a paragraph break yields several
// MarkNodes sharing one id; we keep the minimum so the sidenote aligns with
// the first fragment.
export const SidenotePositionsExtension = defineExtension({
  name: "sidenote-positions",
  afterRegistration: (
    editor: LexicalEditor,
    { sidenotePositions }: SidenotePositionsConfig,
  ) => {
    const nodeKeys = new Set<NodeKey>();

    const measure = () => {
      const tops: SidenotePositions = new Map();
      editor.getEditorState().read(() => {
        for (const key of nodeKeys) {
          const node = $getNodeByKey(key);
          if (node === null || !$isMarkNode(node)) continue;
          const el = editor.getElementByKey(key);
          if (el === null) continue;
          const top = el.offsetTop;
          for (const id of node.getIDs()) {
            const prev = tops.get(id);
            if (prev === undefined || top < prev) tops.set(id, top);
          }
        }
      });
      sidenotePositions.value = tops;
    };

    let rafId = 0;
    const scheduleMeasure = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        measure();
      });
    };

    // Fresh file -> no positions until marks land and we measure.
    sidenotePositions.value = new Map();

    // Attach the ResizeObserver once the contentEditable root is mounted
    // (it is null during afterRegistration). Re-attach if the root changes.
    let resizeObserver: ResizeObserver | null = null;
    const attach = (root: HTMLElement | null) => {
      resizeObserver?.disconnect();
      if (root) {
        resizeObserver = new ResizeObserver(scheduleMeasure);
        resizeObserver.observe(root);
      } else {
        resizeObserver = null;
      }
    };

    const cleanup = mergeRegister(
      editor.registerRootListener((next, prev) => {
        if (next === prev) return;
        attach(next);
        if (next) scheduleMeasure();
      }),
      editor.registerMutationListener(MarkNode, (mutations) => {
        for (const [key, mutation] of mutations) {
          if (mutation === "destroyed") nodeKeys.delete(key);
          else nodeKeys.add(key);
        }
        scheduleMeasure();
      }),
      editor.registerUpdateListener(scheduleMeasure),
    );

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      cleanup();
    };
  },
});
