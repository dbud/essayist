import {
  $getNodeByKey,
  $getRoot,
  type EditorState,
  type LexicalNode,
  type NodeKey,
} from "lexical";

/**
 * An associative binary operation with an identity element. Associativity
 * of combine is what allows a document aggregate to be computed as a fold
 * over per-block values.
 */
export interface Monoid<T> {
  readonly identity: T;
  readonly combine: (a: T, b: T) => T;
}

interface CachedFold<T> {
  parts: Map<NodeKey, T>;
  aggregate: T;
}

/**
 * An incrementally maintained monoid homomorphism from an editor's
 * top-level block sequence to T. With blocks combined by concatenation and
 * f applied per block, the homomorphism law f(a ++ b) = f(a) <+> f(b)
 * makes the document aggregate a fold over per-block values:
 *
 *   f(b1 ++ b2 ++ ...) = f(b1) <+> f(b2) <+> ...
 *
 * `update` recomputes only dirty top-level blocks and re-folds, so a
 * keystroke costs O(dirty blocks), never O(document). Per-block values are
 * cached per EditorState in a WeakMap and chain across edits.
 */
export class BlockFold<T> {
  readonly #monoid: Monoid<T>;
  readonly #compute: (block: LexicalNode) => T;
  readonly #cache = new WeakMap<EditorState, CachedFold<T>>();

  constructor(spec: {
    monoid: Monoid<T>;
    compute: (block: LexicalNode) => T;
  }) {
    this.#monoid = spec.monoid;
    this.#compute = spec.compute;
  }

  /** Aggregate over all top-level blocks, full-folding when cold. */
  read(state: EditorState): T {
    return this.#cache.getOrInsertComputed(state, (s) => this.#fullFold(s))
      .aggregate;
  }

  /**
   * Carry `prev`'s cached fold forward to `next`, re-computing only the
   * dirty top-level blocks. Call within the editor update cycle.
   */
  update(
    next: EditorState,
    prev: EditorState,
    dirtyElements: Map<NodeKey, boolean>,
    dirtyLeaves: Set<NodeKey>,
  ): void {
    if (this.#cache.has(next)) return;
    const prevFold = this.#cache.get(prev);
    if (!prevFold) {
      this.#cache.set(next, this.#fullFold(next));
      return;
    }

    next.read(() => {
      const children = $getRoot().getChildren();
      const newKeys = new Set(children.map((child) => child.getKey()));
      const parts = new Map(prevFold.parts);

      // Re-compute blocks containing a dirty node, plus any new block.
      // `dirtyLeaves` is needed for top-level decorator mutations (e.g. HR),
      // whose key lands in dirtyLeaves, not dirtyElements.
      const dirtyTop = new Set<NodeKey>();
      for (const key of dirtyElements.keys()) {
        const top = topLevelAncestorKey($getNodeByKey(key));
        if (top) dirtyTop.add(top);
      }
      for (const key of dirtyLeaves) {
        const top = topLevelAncestorKey($getNodeByKey(key));
        if (top) dirtyTop.add(top);
      }
      for (const key of newKeys) {
        if (!parts.has(key)) dirtyTop.add(key);
      }

      for (const key of dirtyTop) {
        const node = $getNodeByKey(key);
        if (!node || !newKeys.has(key)) {
          parts.delete(key);
        } else {
          parts.set(key, this.#compute(node));
        }
      }
      for (const key of parts.keys()) {
        if (!newKeys.has(key)) parts.delete(key);
      }

      this.#cache.set(next, {
        parts,
        aggregate: this.#fold(children, parts),
      });
    });
  }

  #fullFold(state: EditorState): CachedFold<T> {
    let parts = new Map<NodeKey, T>();
    let aggregate = this.#monoid.identity;
    state.read(() => {
      const children = $getRoot().getChildren();
      parts = new Map();
      for (const child of children) {
        parts.set(child.getKey(), this.#compute(child));
      }
      aggregate = this.#fold(children, parts);
    });
    return { parts, aggregate };
  }

  // Left fold in document order. combine is associative, so this equals the
  // document aggregate (the homomorphism law). Blocks without a part are
  // skipped, mirroring the removed-key handling in update.
  #fold(children: LexicalNode[], parts: Map<NodeKey, T>): T {
    let acc = this.#monoid.identity;
    for (const child of children) {
      const part = parts.get(child.getKey());
      if (part === undefined) continue;
      acc = this.#monoid.combine(acc, part);
    }
    return acc;
  }
}

// Key of the top-level block containing `node` (null for root/detached).
function topLevelAncestorKey(node: LexicalNode | null): NodeKey | null {
  return node?.getTopLevelElement()?.getKey() ?? null;
}
