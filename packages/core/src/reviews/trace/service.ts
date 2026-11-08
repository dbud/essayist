import { Context, Effect } from "effect";

import type { PersistenceError } from "#/persistence/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import type { TraceEvent } from "./types.ts";

export interface Interface {
  /** Append one event; writers pass their own seq-ordered trace events. */
  append(runId: string, event: TraceEvent): Effect.Effect<void, PersistenceError, WorkspaceId>;
  /** The trace of a run in seq order, oldest first; with afterSeq, only the events past it. */
  get(runId: string, afterSeq?: number): Effect.Effect<TraceEvent[], PersistenceError, WorkspaceId>;
}

export class TraceEvents extends Context.Service<TraceEvents, Interface>()(
  "@essayist/core/reviews/trace/TraceEvents",
) {}
