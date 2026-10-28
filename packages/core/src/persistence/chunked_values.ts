/**
 * JSON values split across KV entries when a value does not fit in one, as
 * an Effect service.
 *
 * A value that fits is stored as one entry: a six-byte header, then the
 * bytes. A larger value is split across several keys under the same base
 * key, numbered by position so a scan returns them in order.
 *
 * Key layout for `put(key, value)`:
 *   key            -> head chunk (framed header + first bytes)
 *   key, "c1"      -> second chunk
 *   key, "c2"      -> third chunk, and so on
 */

import { Context, Effect, Layer, Schema } from "effect";

import { assembleList, chunkKeyPart, planChunks, unframeChunk } from "#/persistence/chunked.ts";
import {
  type ConcurrentModificationError,
  type Key,
  Persistence,
  type PersistenceError,
} from "#/persistence/mod.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A read-back failure: a value is missing entries its head promised. */
export class MissingChunksError extends Schema.TaggedError<MissingChunksError>()(
  "MissingChunksError",
  {
    key: Schema.String,
    nReceived: Schema.Number,
    nChunks: Schema.Number,
  },
) {
  override get message() {
    return `Value at ${this.key} is missing chunks: ${this.nReceived} of ${this.nChunks}`;
  }
}

/** A chunked value read back from storage. */
export interface StoredValue<T> {
  key: Key;
  value: T;
}

export interface Interface {
  /**
   * Write a value, splitting it across entries when it does not fit. Chunks
   * left over from a longer previous value are deleted, since they would
   * otherwise be read back as part of this value.
   */
  put(
    key: Key,
    value: unknown,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  /**
   * Read every value under a prefix, in key order. Fails with
   * {@linkcode MissingChunksError} when a value is missing a chunk.
   */
  list<T>(prefix: Key): Effect.Effect<StoredValue<T>[], PersistenceError | MissingChunksError>;
}

export class ChunkedValues extends Context.Service<ChunkedValues, Interface>()(
  "@essayist/core/persistence/ChunkedValues",
) {
  /** Requires the {@linkcode Persistence} service; compose with
   * Persistence.layerKv at the composition root. */
  static readonly layerNoDeps: Layer.Layer<ChunkedValues, never, Persistence> = Layer.effect(
    ChunkedValues,
    Effect.gen(function* () {
      const persistence = yield* Persistence;

      const put = (
        key: Key,
        value: unknown,
      ): Effect.Effect<void, PersistenceError | ConcurrentModificationError> =>
        Effect.gen(function* () {
          // Read the head before overwriting it, to learn how many chunks
          // the previous value had.
          const previous = yield* persistence.get<Uint8Array>(key);
          const chunks = planChunks(encoder.encode(JSON.stringify(value)));
          for (const chunk of chunks) {
            yield* persistence.set([...key, ...chunk.key], chunk.value);
          }
          const stale = unframeChunk(previous?.value)?.nChunks ?? 0;
          for (let i = chunks.length; i < stale; i++) {
            yield* persistence.delete([...key, chunkKeyPart(i, stale)]);
          }
        });

      const list = <T>(
        prefix: Key,
      ): Effect.Effect<StoredValue<T>[], PersistenceError | MissingChunksError> =>
        Effect.gen(function* () {
          const { entries } = yield* persistence.list<Uint8Array>(prefix);
          const values: StoredValue<T>[] = [];
          for (const assembled of assembleList(entries)) {
            if (!assembled.payload) {
              return yield* Effect.fail(
                new MissingChunksError({
                  key: String(assembled.key),
                  nReceived: assembled.nReceived,
                  nChunks: assembled.nChunks,
                }),
              );
            }
            values.push({
              key: assembled.key,
              value: JSON.parse(decoder.decode(assembled.payload)) as T,
            });
          }
          return values;
        });

      return ChunkedValues.of({ put, list });
    }),
  );
}
