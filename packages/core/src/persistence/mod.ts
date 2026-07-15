/** Persistence layer for the VFS: a key/value adapter with tuple keys. */

/** A tuple key. Parts are strings; KV supports richer types but we don't need them. */
export type Key = readonly string[];

/** A stored entry: its key, value, and versionstamp (for optimistic concurrency). */
export interface Entry<T = unknown> {
  key: Key;
  value: T;
  versionstamp: string;
}

/** Read consistency. In-memory ignores it; KV maps it to `strong`/`eventual`. */
export interface ReadOptions {
  consistency?: "strong" | "eventual";
}

/** Options for paginated scans. */
export interface ListOptions extends ReadOptions {
  /** Max entries to return in this page. */
  limit?: number;
  /** Opaque cursor returned by a previous {@link ListResult.cursor}. */
  cursor?: string;
  /** Reverse iteration (descending tuple order). */
  reverse?: boolean;
}

/** One page of a scan. `cursor` is present when more results remain. */
export interface ListResult<T = unknown> {
  entries: Entry<T>[];
  cursor?: string;
}

/** A write applied atomically within a {@link PersistenceAdapter.batch} call. */
export type WriteOp =
  | { type: "set"; key: Key; value: unknown }
  | { type: "delete"; key: Key };

/** Options for a batch write. */
export interface BatchOptions {
  /**
   * Optimistic-concurrency guards. The batch commits only if every guard
   * passes against the current store state:
   * - `versionstamp: null` requires the key to be absent.
   * - `versionstamp: "<v>"` requires the key to be present with that exact
   *   versionstamp.
   * On any mismatch the whole batch is rejected (no ops applied) and an error
   * is thrown.
   */
  checks?: Array<{ key: Key; versionstamp: string | null }>;
}

/** Error thrown when a batch's `checks` fail optimistic-concurrency validation. */
export class ConcurrentModificationError extends Error {
  constructor(public readonly key: Key) {
    super(`Concurrent modification detected for key ${JSON.stringify(key)}`);
  }
}

/**
 * Key/value persistence with tuple keys, batch/atomic writes, and
 * versionstamp-based optimistic concurrency.
 *
 * Single-key {@link PersistenceAdapter.set} / {@link PersistenceAdapter.delete}
 * are convenience wrappers over {@link PersistenceAdapter.batch}.
 */
export interface PersistenceAdapter {
  /** Read one entry, or `undefined` if absent. */
  get<T = unknown>(
    key: Key,
    options?: ReadOptions,
  ): Promise<Entry<T> | undefined>;

  /** Read many keys in a single round trip. */
  getMany<T = unknown>(
    keys: Key[],
    options?: ReadOptions,
  ): Promise<(Entry<T> | undefined)[]>;

  /** Scan a tuple-prefix range, one page at a time. */
  list<T = unknown>(prefix: Key, options?: ListOptions): Promise<ListResult<T>>;

  /**
   * Apply a set of writes atomically. Without `checks` this is a batch write;
   * with `checks` it is a conditional update that rejects on conflict.
   */
  batch(ops: WriteOp[], options?: BatchOptions): Promise<void>;

  /** Convenience: single-key set (delegates to {@link batch}). */
  set(key: Key, value: unknown): Promise<void>;

  /** Convenience: single-key delete (delegates to {@link batch}). */
  delete(key: Key): Promise<void>;
}

export { InMemoryAdapter } from "./in_memory_adapter.ts";
