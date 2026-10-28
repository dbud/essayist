/**
 * Runtime-neutral KV implementation of the {@linkcode Persistence} service:
 * `Deno.Kv`-shaped calls wrapped in Effects, with a failed concurrency
 * check failing as {@linkcode ConcurrentModificationError}.
 *
 * {@linkcode kvLayer} is the implementation, typed structurally
 * against the npm `@deno/kv` client interface, so non-Deno runtimes (vitest,
 * the future KV Connect bridge) pass handles from that package. Deno call
 * sites enter through the sibling `kv_deno.ts` over a native `Deno.Kv`
 * handle.
 */

import type { Kv, KvEntryMaybe } from "@deno/kv";
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

export function kvLayer(kv: Kv): Layer.Layer<Persistence> {
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
        cause instanceof ConcurrentModificationError ? cause : backendFault(cause),
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
              )) as KvEntryMaybe<T>[];
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
              // The deno runtime answers "" (or nothing) for a listing
              // that never advanced or reached its end; the npm client
              // throws before the first iteration and keeps the
              // last-yielded key as the cursor at the end of the listing.
              // Normalize both to "no next page", and treat a short final
              // page under a limit as exhausted.
              let next = "";
              try {
                next = iter.cursor ?? "";
              } catch {
                next = "";
              }
              return {
                entries,
                cursor: next === "" || !limit || entries.length < limit ? undefined : next,
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

/** A layer owning one open/close lifecycle of a `@deno/kv`-shaped handle:
 * the open effect runs at acquisition, the close at release. */
export function layerKvHandle(
  open: Effect.Effect<Kv, PersistenceError>,
): Layer.Layer<Persistence, PersistenceError> {
  return Layer.unwrap(
    Effect.map(
      Effect.acquireRelease(open, (kv) => Effect.sync(() => kv.close())),
      kvLayer,
    ),
  );
}
