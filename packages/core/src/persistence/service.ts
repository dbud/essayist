/**
 * The persistence adapter as an Effect service.
 *
 * Wraps a {@linkcode PersistenceAdapter} (Deno KV or in-memory) so its
 * methods return Effects; the adapters underneath keep their promise API.
 */

import { Context, Effect, Layer, Schema } from "effect";
import { kvLayer } from "./kv_layer.ts";
import { memoryLayer } from "./memory_layer.ts";
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

/** A backend fault: the underlying adapter failed. */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "PersistenceError",
  { cause: Schema.Defect() },
) {}

/** Key/value persistence with tuple keys, as an Effect service. */
export class Persistence extends Context.Service<
  Persistence,
  {
    /** Read a single entry, or `undefined` if absent. */
    get<T = unknown>(
      key: Key,
      options?: ReadOptions,
    ): Effect.Effect<Entry<T> | undefined, PersistenceError>;
    /** Read many keys in a single round trip. */
    getMany<T = unknown>(
      keys: Key[],
      options?: ReadOptions,
    ): Effect.Effect<(Entry<T> | undefined)[], PersistenceError>;
    /** Scan a tuple-prefix range, a page at a time. */
    list<T = unknown>(
      prefix: Key,
      options?: ListOptions,
    ): Effect.Effect<ListResult<T>, PersistenceError>;
    /** Apply a set of writes atomically, with optional concurrency checks. */
    batch(
      ops: WriteOp[],
      options?: BatchOptions,
    ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
    /** Single-key set, a convenience over batch. */
    set(
      key: Key,
      value: unknown,
    ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
    /** Single-key delete, a convenience over batch. */
    delete(
      key: Key,
    ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  }
>()("@essayist/core/persistence/Persistence") {
  /**
   * Migration bridge for promise-based adapters and their consumers: the
   * lease helpers, value stores, kvctl, and stores not yet on the
   * service. New code should use layerKv or layerMemory.
   */
  static layerFromAdapter(
    adapter: PersistenceAdapter,
  ): Layer.Layer<Persistence> {
    return Layer.effect(
      Persistence,
      Effect.sync(() =>
        Persistence.of({
          get: <T = unknown>(key: Key, options?: ReadOptions) =>
            Effect.tryPromise({
              try: () => adapter.get<T>(key, options),
              catch: (cause) => new PersistenceError({ cause }),
            }),
          getMany: <T = unknown>(keys: Key[], options?: ReadOptions) =>
            Effect.tryPromise({
              try: () => adapter.getMany<T>(keys, options),
              catch: (cause) => new PersistenceError({ cause }),
            }),
          list: <T = unknown>(prefix: Key, options?: ListOptions) =>
            Effect.tryPromise({
              try: () => adapter.list<T>(prefix, options),
              catch: (cause) => new PersistenceError({ cause }),
            }),
          batch: (ops: WriteOp[], options?: BatchOptions) =>
            Effect.tryPromise({
              try: () => adapter.batch(ops, options),
              catch: (cause) =>
                cause instanceof ConcurrentModificationError
                  ? cause
                  : new PersistenceError({ cause }),
            }),
          set: (key: Key, value: unknown) =>
            Effect.tryPromise({
              try: () => adapter.set(key, value),
              catch: (cause) => new PersistenceError({ cause }),
            }),
          delete: (key: Key) =>
            Effect.tryPromise({
              try: () => adapter.delete(key),
              catch: (cause) => new PersistenceError({ cause }),
            }),
        }),
      ),
    );
  }

  /** Fresh in-memory state per call; `initial` seeds entries, for tests. */
  static layerMemory(
    initial?: Iterable<readonly [Key, unknown]>,
  ): Layer.Layer<Persistence> {
    return memoryLayer(initial);
  }

  /** A layer backed by an already-open `Deno.Kv`. */
  static layerKv(kv: Deno.Kv): Layer.Layer<Persistence> {
    return kvLayer(kv);
  }
}
