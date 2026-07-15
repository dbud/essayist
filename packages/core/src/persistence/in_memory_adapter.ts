import {
  type BatchOptions,
  ConcurrentModificationError,
  type Entry,
  type Key,
  type ListOptions,
  type ListResult,
  type PersistenceAdapter,
  type ReadOptions,
  type WriteOp,
} from "./mod.ts";

/** Serialize a key to a stable string (for map indexing). */
function keyToString(key: Key): string {
  return JSON.stringify(key);
}

/** Compare two tuple keys lexicographically, part by part (string comparison). */
function compareKeys(a: Key, b: Key): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}

/** True if `key` starts with the tuple `prefix` (every part matches). */
function keyStartsWith(key: Key, prefix: Key): boolean {
  if (key.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (key[i] !== prefix[i]) return false;
  }
  return true;
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
