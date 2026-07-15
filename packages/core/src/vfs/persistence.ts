/** Persistence layer for the VFS: a key/value adapter with tuple keys. */

/** A tuple key. Parts are strings; KV supports richer types but we don't need them. */
export type Key = readonly string[];

/** A stored entry: its key, value, and versionstamp (for optimistic concurrency). */
export interface Entry<T = unknown> {
  key: Key;
  value: T;
  versionstamp: string;
}

/** Read consistency. In-memory ignores it; KV maps it to `strong`/`eventually`. */
export interface ReadOptions {
  consistency?: "strong" | "eventually";
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

/** Compare two tuple keys lexicographically, part by part (string comparison). */
export function compareKeys(a: Key, b: Key): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}

/** True if `key` starts with the tuple `prefix` (every part matches). */
export function keyStartsWith(key: Key, prefix: Key): boolean {
  if (key.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (key[i] !== prefix[i]) return false;
  }
  return true;
}

/** Serialize a key to a stable string (for map indexing). */
function keyToString(key: Key): string {
  return JSON.stringify(key);
}

/** In-memory {@link PersistenceAdapter} backed by a `Map`. Intended for tests. */
export class InMemoryAdapter implements PersistenceAdapter {
  #store = new Map<string, Entry>();
  #counter = 0;

  constructor(initial?: Iterable<readonly [Key, unknown]>) {
    if (initial) {
      for (const [key, value] of initial) {
        void this.set(key, value);
      }
    }
  }

  // deno-lint-ignore require-await
  async get<T = unknown>(
    key: Key,
    _options?: ReadOptions,
  ): Promise<Entry<T> | undefined> {
    const entry = this.#store.get(keyToString(key));
    return entry as Entry<T> | undefined;
  }

  // deno-lint-ignore require-await
  async getMany<T = unknown>(
    keys: Key[],
    _options?: ReadOptions,
  ): Promise<(Entry<T> | undefined)[]> {
    return keys.map(
      (key) => this.#store.get(keyToString(key)) as Entry<T> | undefined,
    );
  }

  // deno-lint-ignore require-await
  async list<T = unknown>(
    prefix: Key,
    options?: ListOptions,
  ): Promise<ListResult<T>> {
    const { limit, cursor, reverse = false } = options ?? {};

    const matched: Entry[] = [];
    for (const entry of this.#store.values()) {
      if (keyStartsWith(entry.key, prefix)) matched.push(entry);
    }
    matched.sort((a, b) => compareKeys(a.key, b.key));
    if (reverse) matched.reverse();

    let start = 0;
    if (cursor !== undefined) {
      const cursorKey = JSON.parse(cursor) as Key;
      // Resume strictly after the cursor key.
      start = matched.findIndex((e) => compareKeys(e.key, cursorKey) > 0);
      if (start === -1) return { entries: [] };
    }

    let slice: Entry[];
    let nextCursor: string | undefined;
    if (limit !== undefined && limit > 0) {
      slice = matched.slice(start, start + limit);
      const lastIndex = start + slice.length - 1;
      if (lastIndex < matched.length - 1) {
        nextCursor = JSON.stringify(matched[lastIndex].key);
      }
    } else {
      slice = matched.slice(start);
    }

    return { entries: slice as Entry<T>[], cursor: nextCursor };
  }

  // deno-lint-ignore require-await
  async batch(ops: WriteOp[], options?: BatchOptions): Promise<void> {
    const checks = options?.checks ?? [];

    // Validate all checks against current state before applying anything.
    for (const { key, versionstamp } of checks) {
      const current = this.#store.get(keyToString(key));
      if (versionstamp === null) {
        if (current !== undefined) throw new ConcurrentModificationError(key);
      } else {
        if (current === undefined || current.versionstamp !== versionstamp) {
          throw new ConcurrentModificationError(key);
        }
      }
    }

    // Apply all ops (in-memory is single-threaded, so atomicity is trivial).
    for (const op of ops) {
      if (op.type === "set") {
        const entry: Entry = {
          key: op.key,
          value: op.value,
          versionstamp: `v${++this.#counter}`,
        };
        this.#store.set(keyToString(op.key), entry);
      } else {
        this.#store.delete(keyToString(op.key));
      }
    }
  }

  set(key: Key, value: unknown): Promise<void> {
    return this.batch([{ type: "set", key, value }]);
  }

  delete(key: Key): Promise<void> {
    return this.batch([{ type: "delete", key }]);
  }
}
