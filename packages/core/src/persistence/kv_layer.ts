/**
 * Native KV implementation of the {@linkcode Persistence} service: the
 * same `Deno.Kv` calls {@linkcode KvAdapter} makes, wrapped in Effects,
 * with a failed concurrency check failing as
 * {@linkcode ConcurrentModificationError}.
 */

import { Effect, Layer } from "effect";
import {
  type BatchOptions,
  ConcurrentModificationError,
  type Entry,
  type Key,
  type ListOptions,
  type ReadOptions,
  type WriteOp,
} from "./mod.ts";
import { Persistence, PersistenceError } from "./service.ts";

/** Wrap a promise rejection (or a thrown fault) as a PersistenceError. */
const backendFault = (cause: unknown) => new PersistenceError({ cause });

export function kvLayer(kv: Deno.Kv): Layer.Layer<Persistence> {
  const batch = (ops: WriteOp[], options?: BatchOptions) =>
    Effect.tryPromise({
      try: async () => {
        let atomic = kv.atomic();
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
          // A check failed (concurrent modification); pick the key from the
          // first check for the error, or an empty key if there were none.
          throw new ConcurrentModificationError({
            key: [...(checks[0]?.key ?? [])],
          });
        }
      },
      catch: (cause) =>
        cause instanceof ConcurrentModificationError
          ? cause
          : backendFault(cause),
    });

  return Layer.effect(
    Persistence,
    Effect.sync(() =>
      Persistence.of({
        get: <T = unknown>(key: Key, options?: ReadOptions) =>
          Effect.tryPromise({
            try: async () => {
              const entry = await kv.get<T>([...key], {
                consistency: options?.consistency,
              });
              // KV returns { value: null, versionstamp: null } for a missing key.
              if (entry.versionstamp === null) return undefined;
              return {
                key: entry.key as Key,
                value: entry.value,
                versionstamp: entry.versionstamp,
              };
            },
            catch: backendFault,
          }),
        getMany: <T = unknown>(keys: Key[], options?: ReadOptions) =>
          Effect.tryPromise({
            try: async () => {
              const entries = (await kv.getMany(
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
            },
            catch: backendFault,
          }),
        list: <T = unknown>(prefix: Key, options?: ListOptions) =>
          Effect.tryPromise({
            try: async () => {
              const { limit, cursor, reverse, consistency } = options ?? {};
              const iter = kv.list<T>(
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
            },
            catch: backendFault,
          }),
        batch,
        set: (key: Key, value: unknown) => batch([{ type: "set", key, value }]),
        delete: (key: Key) => batch([{ type: "delete", key }]),
      }),
    ),
  );
}
