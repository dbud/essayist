/**
 * The persistence service: tuple keys, atomic batch writes, and versionstamp-based optimistic
 * concurrency, as Effects.
 */

import { Context, type Effect, Schema } from "effect";

import type {
  BatchOptions,
  ConcurrentModificationError,
  Entry,
  Key,
  ListOptions,
  ListResult,
  ReadOptions,
  WriteOp,
} from "./mod.ts";

/** A backend fault: the underlying adapter failed. */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()("PersistenceError", {
  cause: Schema.Defect(),
}) {
  override get message() {
    return "the persistence backend failed";
  }
}

export interface Interface {
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
  delete(key: Key): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
}

/** Key/value persistence with tuple keys, as an Effect service. */
export class Persistence extends Context.Service<Persistence, Interface>()(
  "@essayist/core/persistence/Persistence",
) {}
