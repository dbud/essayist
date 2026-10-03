import type { FlowEvent } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";

/** The run a trace belongs to. */
export interface TraceScope {
  wsId: string;
  runId: string;
}

/** The engine's event stream stamped with its seq and wall-clock time. */
export type TraceEvent = FlowEvent<ReviewTypes> & {
  seq: number;
  at: number;
};

/** Receives trace events as they happen. */
export interface TraceRecorder {
  record(event: FlowEvent<ReviewTypes>): void;
  /** Await pending appends and close the sink. */
  flush(): Promise<void>;
}

/**
 * Storage strategy for review traces.
 *
 * TODO -- blob strategy: buffer appends, commit a chunked blob in end().
 */
export interface TraceStore {
  /** Append an event; calls arrive in seq order. */
  append({
    wsId,
    runId,
    event,
  }: TraceScope & { event: TraceEvent }): Promise<void>;

  /** Mark the trace complete. */
  end({ wsId, runId }: TraceScope): Promise<void>;

  /** Read the trace of a run in seq order, oldest first; undefined when
   * nothing was written. */
  get({ wsId, runId }: TraceScope): Promise<TraceEvent[] | undefined>;

  /** Recorder bound to a run. onEvent receives each derived event. */
  recorder(
    scope: TraceScope,
    onEvent?: (event: TraceEvent) => void,
  ): TraceRecorder;
}
