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
import { getMeasureContext, hasRect, textPointRect } from "./domMeasure.ts";
import { createRafScheduler, registerRootObserver } from "./editorDom.ts";
import { registerNodeKeyTracker } from "./nodeKeyTracker.ts";

export interface TrackedFragment {
  el: HTMLElement;
  ids: string[];
  top: number;
  key: NodeKey;
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
  /**
   * Positions to measure for ids with no tracked node (e.g. zero-length
   * marks, which wrap no text and so produce no MarkNode). Each spec maps an
   * id to a TextNode key + local offset; the line top is derived from a
   * collapsed Range at that offset, in the same coordinate space as the
   * fragment offsetTop (relative to the root's offsetParent).
   */
  points?: () => PointSpec[];
}

export interface PointSpec {
  id: string;
  key: NodeKey;
  offset: number;
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
    points,
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
        fragments.push({ el, ids: getIds(node), top: el.offsetTop, key });
      }
    });

    const tops = new Map<string, number>();
    for (const { ids, top } of fragments) {
      for (const id of ids) {
        const prev = tops.get(id);
        if (prev === undefined || top < prev) tops.set(id, top);
      }
    }
    measurePoints(editor, points?.(), tops);
    if (!equal(output.value, tops)) output.value = tops;
    onFragments?.(fragments);
  };

  const { schedule: scheduleMeasure, dispose } = createRafScheduler(measure);

  output.value = new Map();

  const removeRootObserver = registerRootObserver(editor, (root) => {
    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(root);
    scheduleMeasure();
    return () => ro.disconnect();
  });

  const disposers = [
    removeRootObserver,
    registerNodeKeyTracker(editor, nodeClass, nodeKeys, scheduleMeasure),
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

  return mergeRegister(...disposers, dispose);
}

/**
 * Measures point specs (ids with no tracked node) into `tops`, in the same
 * coordinate space as fragment offsetTop: relative to the root element's
 * offsetParent. Uses a collapsed Range at the TextNode offset so the line top
 * is correct even inside a multi-line paragraph (where the TextNode element's
 * own offsetTop would point at its first line).
 */
function measurePoints(
  editor: LexicalEditor,
  specs: PointSpec[] | undefined,
  tops: Map<string, number>,
) {
  if (!specs || specs.length === 0) return;
  const ctx = getMeasureContext(editor.getRootElement());
  if (ctx === null) return;
  const { containerRect, doc } = ctx;
  for (const { id, key, offset } of specs) {
    if (tops.has(id)) continue; // a tracked node already covers this id
    const el = editor.getElementByKey(key);
    if (el === null) continue;
    const rect = textPointRect(el, offset, doc);
    if (!hasRect(rect)) continue;
    tops.set(id, rect.top - containerRect.top);
  }
}
