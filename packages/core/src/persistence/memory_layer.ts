/**
 * Native in-memory implementation of the {@linkcode Persistence} service:
 * the same semantics as {@linkcode InMemoryAdapter} (monotonic
 * versionstamps, concurrency checks, cursor-paginated scans), synchronous,
 * mostly for tests.
 */

import { Effect, Layer } from "effect";
import { compareKeys, keyStartsWith, keyToString } from "./keys.ts";
import {
  type BatchOptions,
  ConcurrentModificationError,
  type Entry,
  type Key,
  type ListOptions,
  type ListResult,
  type ReadOptions,
  type WriteOp,
} from "./mod.ts";
import { Persistence } from "./service.ts";

export function memoryLayer(
  initial?: Iterable<readonly [Key, unknown]>,
): Layer.Layer<Persistence> {
  const store = new Map<string, Entry>();
  let counter = 0;

  if (initial) {
    for (const [key, value] of initial) {
      store.set(keyToString(key), {
        key,
        value,
        versionstamp: `v${++counter}`,
      });
    }
  }

  const batch = (ops: WriteOp[], options?: BatchOptions) =>
    Effect.gen(function* () {
      const checks = options?.checks ?? [];

      // Validate all checks against current state before applying anything.
      for (const { key, versionstamp } of checks) {
        const current = store.get(keyToString(key));
        if (versionstamp === null) {
          if (current !== undefined) {
            return yield* Effect.fail(new ConcurrentModificationError(key));
          }
        } else {
          if (current === undefined || current.versionstamp !== versionstamp) {
            return yield* Effect.fail(new ConcurrentModificationError(key));
          }
        }
      }

      // Apply all ops (in-memory is single-threaded, so atomicity is trivial).
      for (const op of ops) {
        if (op.type === "set") {
          store.set(keyToString(op.key), {
            key: op.key,
            value: op.value,
            versionstamp: `v${++counter}`,
          });
        } else {
          store.delete(keyToString(op.key));
        }
      }
    });

  return Layer.effect(
    Persistence,
    Effect.sync(() =>
      Persistence.of({
        get: <T = unknown>(
          key: Key,
          _options?: ReadOptions,
        ): Effect.Effect<Entry<T> | undefined> =>
          Effect.sync(
            () => store.get(keyToString(key)) as Entry<T> | undefined,
          ),
        getMany: <T = unknown>(keys: Key[], _options?: ReadOptions) =>
          Effect.sync(() =>
            keys.map(
              (key) => store.get(keyToString(key)) as Entry<T> | undefined,
            ),
          ),
        list: <T = unknown>(prefix: Key, options?: ListOptions) =>
          Effect.sync((): ListResult<T> => {
            const { limit, cursor, reverse = false } = options ?? {};

            const matched: Entry[] = [];
            for (const entry of store.values()) {
              if (keyStartsWith(entry.key, prefix)) matched.push(entry);
            }
            matched.sort((a, b) => compareKeys(a.key, b.key));
            if (reverse) matched.reverse();

            let start = 0;
            if (cursor !== undefined) {
              const cursorKey = JSON.parse(cursor) as Key;
              // Resume strictly after the cursor key.
              start = matched.findIndex(
                (e) => compareKeys(e.key, cursorKey) > 0,
              );
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
          }),
        batch,
        set: (key: Key, value: unknown) => batch([{ type: "set", key, value }]),
        delete: (key: Key) => batch([{ type: "delete", key }]),
      }),
    ),
  );
}
