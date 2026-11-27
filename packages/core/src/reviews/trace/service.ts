import { Context, type Effect } from "effect";

import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import type { TraceEvent } from "./types.ts";

export interface Interface {
  /** Append an event to the trace of a run. The runner is the only writer, so the workspace is
   * not checked. */
  append(runId: string, event: TraceEvent): Effect.Effect<void>;
  /** The trace of a run in seq order; with afterSeq, only the events past it. */
  get(runId: string, afterSeq?: number): Effect.Effect<TraceEvent[], never, WorkspaceId>;
}

export class TraceEvents extends Context.Service<TraceEvents, Interface>()(
  "@essayist/core/reviews/trace/TraceEvents",
) {}
