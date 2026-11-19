import { effect, type ReadonlySignal, signal } from "@preact/signals";
import { mergeRegister, type LexicalEditor } from "lexical";

// Coalesce many schedule() calls into a single fn() on the next animation frame; dispose() cancels
// a pending frame. For extensions that re-measure the DOM only after Lexical has reconciled.
// With no animation frame loop (SSR, headless) measurements cannot run, so scheduling is a no-op.
// Returns [schedule, dispose].
export function createRafScheduler(fn: () => void): [() => void, () => void] {
  if (typeof requestAnimationFrame === "undefined") return [() => {}, () => {}];
  let rafId = 0;
  const run = () => {
    rafId = 0;
    fn();
  };
  const schedule = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(run);
  };
  const dispose = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };
  return [schedule, dispose];
}

// Observes the editor root element: calls schedule when the root is attached and whenever its size
// changes, following root swaps.
export function registerResizeObserver(editor: LexicalEditor, schedule: () => void): () => void {
  return registerRootObserver(editor, (root) => {
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    schedule();
    return () => ro.disconnect();
  });
}

// Calls schedule once per completed batch of web font loads (document.fonts loadingdone): fonts
// changing text metrics shifts line boxes. No-op where the FontFaceSet is unavailable.
export function registerFontLoadObserver(schedule: () => void): () => void {
  if (typeof document === "undefined" || !document.fonts) return () => {};
  document.fonts.addEventListener("loadingdone", schedule);
  return () => document.fonts.removeEventListener("loadingdone", schedule);
}

// Calls schedule whenever any of the signals changes. The `void` read is the subscription:
// schedule's deferred work runs outside the effect, so it tracks nothing extra.
export function registerSignalsObserver(
  signals: ReadonlyArray<ReadonlySignal<unknown>>,
  schedule: () => void,
): () => void {
  const disposers = signals.map((s) =>
    effect(() => {
      void s.value;
      schedule();
    }),
  );
  return mergeRegister(...disposers);
}

// Pointer move distance past which a press counts as a drag, not a click.
const DRAG_THRESHOLD_PX = 2;

// Tracks pointer drags across the document so caret following can yield to native drag scrolling.
// dragging.value turns on once the pointer moves with the button held; plain clicks do not count.
export function watchPointerDrags(): [ReadonlySignal<boolean>, () => void] {
  const dragging = signal(false);
  let pointerDown: { x: number; y: number } | null = null;
  if (typeof document === "undefined") return [dragging, () => {}];
  const onDown = (e: PointerEvent) => {
    dragging.value = false;
    pointerDown = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    if (pointerDown === null) return;
    if (
      Math.abs(e.clientX - pointerDown.x) > DRAG_THRESHOLD_PX ||
      Math.abs(e.clientY - pointerDown.y) > DRAG_THRESHOLD_PX
    ) {
      dragging.value = true;
      pointerDown = null;
    }
  };
  const onUp = () => {
    pointerDown = null;
    dragging.value = false;
  };
  document.addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerup", onUp, { passive: true });
  document.addEventListener("pointercancel", onUp, { passive: true });
  return [
    dragging,
    () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    },
  ];
}

// Attach root-scoped observers (ResizeObserver, event listeners) that must follow the root of the
// editor across swaps. setup(root) returns a teardown run before the next root is set up and on
// final cleanup. The initial root is set up synchronously.
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
