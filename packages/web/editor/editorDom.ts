import type { LexicalEditor } from "lexical";

// Coalesce many schedule() calls into a single fn() on the next animation
// frame; dispose() cancels a pending frame. For extensions that re-measure the
// DOM only after Lexical has reconciled.
export function createRafScheduler(fn: () => void): {
  schedule: () => void;
  dispose: () => void;
} {
  let rafId = 0;
  const run = () => {
    rafId = 0;
    fn();
  };
  return {
    schedule: () => {
      if (rafId) return;
      rafId = requestAnimationFrame(run);
    },
    dispose: () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    },
  };
}

// Attach root-scoped observers (ResizeObserver, event listeners) that must
// follow the editor's root across swaps. setup(root) returns a teardown run
// before the next root is set up and on final cleanup. The initial root is
// set up synchronously.
export function registerRootObserver(
  editor: LexicalEditor,
  setup: (root: HTMLElement) => () => void,
): () => void {
  let teardown: (() => void) | null = null;
  const attach = (root: HTMLElement | null) => {
    teardown?.();
    teardown = root === null ? null : setup(root);
  };
  attach(editor.getRootElement());
  const unregister = editor.registerRootListener((next, prev) => {
    if (next === prev) return;
    attach(next);
  });
  return () => {
    teardown?.();
    unregister();
  };
}
