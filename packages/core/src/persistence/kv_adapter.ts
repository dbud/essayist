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

/**
 * {@link PersistenceAdapter} backed by Deno KV.
 *
 * Requires the `--unstable-kv` flag at runtime (the caller opens the `Deno.Kv`
 * instance and passes it in). Our tuple `Key` (string parts) maps directly onto
 * KV's `KvKey`. Optimistic-concurrency `checks` map onto `kv.atomic().check()`;
 * a failed check makes `commit()` return `{ ok: false }`, which we surface as a
 * {@link ConcurrentModificationError} so the VFS retry loop works uniformly.
 */
export class KvAdapter implements PersistenceAdapter {
  #kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.#kv = kv;
  }

  async get<T = unknown>(
    key: Key,
    options?: ReadOptions,
  ): Promise<Entry<T> | undefined> {
    const entry = await this.#kv.get<T>([...key], {
      consistency: options?.consistency,
    });
    // KV returns { value: null, versionstamp: null } for a missing key.
    if (entry.versionstamp === null) return undefined;
    return {
      key: entry.key as Key,
      value: entry.value,
      versionstamp: entry.versionstamp,
    };
  }

  async getMany<T = unknown>(
    keys: Key[],
    options?: ReadOptions,
  ): Promise<(Entry<T> | undefined)[]> {
    const entries = (await this.#kv.getMany(
      keys.map((k) => [...k]),
      { consistency: options?.consistency },
    )) as Deno.KvEntryMaybe<T>[];
    return entries.map((entry) =>
      entry.versionstamp === null
        ? undefined
        : {
            key: entry.key as Key,
            value: entry.value,
            versionstamp: entry.versionstamp,
          },
    );
  }

  async list<T = unknown>(
    prefix: Key,
    options?: ListOptions,
  ): Promise<ListResult<T>> {
    const { limit, cursor, reverse, consistency } = options ?? {};
    const iter = this.#kv.list<T>(
      { prefix: [...prefix] },
      { limit, cursor, reverse, consistency },
    );
    const entries: Entry<T>[] = [];
    for await (const entry of iter) {
      entries.push({
        key: entry.key as Key,
        value: entry.value,
        versionstamp: entry.versionstamp,
      });
    }
    // KV uses "" for "no more pages"; normalize to undefined.
    const next = iter.cursor;
    return {
      entries,
      cursor: !next || next === "" ? undefined : next,
    };
  }

  async batch(ops: WriteOp[], options?: BatchOptions): Promise<void> {
    let atomic = this.#kv.atomic();
    const checks = options?.checks ?? [];
    for (const { key, versionstamp } of checks) {
      atomic = atomic.check({ key: [...key], versionstamp });
    }
    for (const op of ops) {
      if (op.type === "set") {
        atomic = atomic.set([...op.key], op.value);
      } else {
        atomic = atomic.delete([...op.key]);
      }
    }
    const result = await atomic.commit();
    if (!result.ok) {
      // A check failed (concurrent modification); pick the first check's key
      // for the error, or an empty key if there were none.
      throw new ConcurrentModificationError(checks[0]?.key ?? []);
    }
  }

  set(key: Key, value: unknown): Promise<void> {
    return this.batch([{ type: "set", key, value }]);
  }

  delete(key: Key): Promise<void> {
    return this.batch([{ type: "delete", key }]);
  }
}
