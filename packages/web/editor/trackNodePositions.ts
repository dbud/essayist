import { effect, type Signal } from "@preact/signals";
import { equal } from "@std/assert/equal";
import {
  $getNodeByKey,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
} from "lexical";

export interface TrackedFragment {
  el: HTMLElement;
  ids: string[];
  top: number;
}

export interface TrackNodePositionsOptions<T extends LexicalNode> {
  /** Lexical node class whose instances to track. */
  nodeClass: Klass<T>;
  /** Narrows a node to T (e.g. `$isMarkNode`). */
  isNode: (node: LexicalNode | null) => node is T;
  /** Returns the ids a node contributes to (a node may carry several). */
  getIds: (node: T) => string[];
  /** Where to publish id -> minimum offsetTop (relative to the offsetParent). */
  output: Signal<Map<string, number>>;
  /** Signals whose change should trigger a re-measure (e.g. ordinals). */
  remeasureOn?: ReadonlyArray<Signal<unknown>>;
  /** Extra per-fragment work after measuring (e.g. DOM badging). */
  onFragments?: (fragments: TrackedFragment[]) => void;
}

/**
 * Tracks the vertical position of every instance of `nodeClass` in the editor
 * and publishes id -> minimum offsetTop into `output` (a node spanning a
 * paragraph break yields several nodes sharing ids; the min aligns to the
 * first). Re-measures on editor update, node mutation, root resize, and any
 * `remeasureOn` signal change -- never on scroll, since offsetTop is stable
 * under scroll. rAF-deferred so DOM and mutation callbacks have settled.
 *
 * Returns a cleanup function. The measured elements must not affect the
 * observed root's size (e.g. they are inline), so repositioning doesn't loop
 * the ResizeObserver.
 */
export function trackNodePositions<T extends LexicalNode>(
  editor: LexicalEditor,
  {
    nodeClass,
    isNode,
    getIds,
    output,
    remeasureOn,
    onFragments,
  }: TrackNodePositionsOptions<T>,
): () => void {
  const nodeKeys = new Set<NodeKey>();

  const measure = () => {
    const fragments: TrackedFragment[] = [];
    editor.getEditorState().read(() => {
      for (const key of nodeKeys) {
        const node = $getNodeByKey(key);
        if (!isNode(node)) continue;
        const el = editor.getElementByKey(key);
        if (el === null) continue;
        fragments.push({ el, ids: getIds(node), top: el.offsetTop });
      }
    });

    const tops = new Map<string, number>();
    for (const { ids, top } of fragments) {
      for (const id of ids) {
        const prev = tops.get(id);
        if (prev === undefined || top < prev) tops.set(id, top);
      }
    }
    if (!equal(output.value, tops)) output.value = tops;
    onFragments?.(fragments);
  };

  let rafId = 0;
  const scheduleMeasure = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      measure();
    });
  };

  output.value = new Map();

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

  const disposers = [
    editor.registerRootListener((next, prev) => {
      if (next === prev) return;
      attach(next);
      if (next) scheduleMeasure();
    }),
    editor.registerMutationListener(nodeClass, (mutations) => {
      for (const [key, mutation] of mutations) {
        if (mutation === "destroyed") nodeKeys.delete(key);
        else nodeKeys.add(key);
      }
      scheduleMeasure();
    }),
    editor.registerUpdateListener(scheduleMeasure),
  ];
  for (const s of remeasureOn ?? []) {
    disposers.push(
      effect(() => {
        s.value;
        scheduleMeasure();
      }),
    );
  }

  const cleanup = mergeRegister(...disposers);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    resizeObserver?.disconnect();
    cleanup();
  };
}
