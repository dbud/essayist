/**
 * Review traces as an Effect service: one entry per event, split across
 * entries when an event does not fit.
 *
 * Key layout (workspace-scoped via the WorkspaceId tag):
 *   ["review_traces", wsId, runId, "000000"] -> TraceEvent
 *
 * Writers number their events; a seq of 6 padded zero-filled digits orders
 * the scan. Reads sort by seq, not by key, so resumes beyond 999999 stay
 * ordered.
 */

import { sortBy } from "@std/collections";
import { Context, Effect, Layer } from "effect";
import {
  ChunkedValues,
  type MissingChunksError,
} from "@/persistence/chunked_values.ts";
import type {
  ConcurrentModificationError,
  PersistenceError,
} from "@/persistence/mod.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";
import type { TraceEvent } from "./types.ts";

const TRACES = "review_traces";

export interface Interface {
  /** Append one event; writers pass their own seq-ordered trace events. */
  append(
    runId: string,
    event: TraceEvent,
  ): Effect.Effect<
    void,
    PersistenceError | ConcurrentModificationError,
    WorkspaceId
  >;
  /**
   * The trace of a run in seq order, oldest first; undefined when nothing
   * was written. A stored event missing a chunk fails the read.
   */
  get(
    runId: string,
  ): Effect.Effect<
    TraceEvent[] | undefined,
    PersistenceError | MissingChunksError,
    WorkspaceId
  >;
}

export class TraceEvents extends Context.Service<TraceEvents, Interface>()(
  "@essayist/core/reviews/trace/TraceEvents",
) {
  /** Requires the {@linkcode ChunkedValues} service; compose from
   * Persistence.layerKv at the composition root. The workspace scope comes
   * from the WorkspaceId tag at call time. */
  static readonly layerNoDeps: Layer.Layer<TraceEvents, never, ChunkedValues> =
    Layer.effect(
      TraceEvents,
      Effect.gen(function* () {
        const values = yield* ChunkedValues;

        const append = (
          runId: string,
          event: TraceEvent,
        ): Effect.Effect<
          void,
          PersistenceError | ConcurrentModificationError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            yield* values.put(
              [TRACES, wsId, runId, String(event.seq).padStart(6, "0")],
              event,
            );
          });

        const get = (
          runId: string,
        ): Effect.Effect<
          TraceEvent[] | undefined,
          PersistenceError | MissingChunksError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const stored = yield* values.list<TraceEvent>([
              TRACES,
              wsId,
              runId,
            ]);
            if (stored.length === 0) return undefined;
            return sortBy(stored, (entry) => entry.value.seq).map(
              (entry) => entry.value,
            );
          });

        return TraceEvents.of({ append, get });
      }),
    );
}
