import type { FlowEvent } from "@/flow/types.ts";
import { logger } from "@/logger.ts";
import type { PersistenceAdapter } from "@/persistence/mod.ts";
import type { ReviewNodeEvent, ReviewTypes } from "@/reviews/graph.ts";
import { SerialTasks } from "@/utils/serial.ts";

// Key layout:
//   ["review_traces", wsId, runId, "000000"] -> TracedReviewEvent
const TRACES = "review_traces";

// Deno KV values cap at 64 KiB. Outputs embed structured artifacts,
// so oversized payloads are elided here.
const MAX_PAYLOAD_CHARS = 16_000;

/** The run a trace belongs to. */
export interface TraceScope {
  wsId: string;
  runId: string;
}

/** The engine's event stream stamped with its seq and wall-clock time. */
export type TracedReviewEvent = FlowEvent<ReviewTypes> & {
  seq: number;
  at: number;
};

/** Receives trace events as they happen. */
export interface ReviewTraceSink {
  record(event: FlowEvent<ReviewTypes>): void;
  /** Await pending appends and close the sink. */
  flush(): Promise<void>;
}

/**
 * Storage strategy for review traces.
 *
 * TODO -- blob strategy: buffer appends, commit one chunked blob in end().
 */
export interface TraceStore {
  /** Append an event; calls arrive in seq order. */
  append({
    wsId,
    runId,
    event,
  }: TraceScope & { event: TracedReviewEvent }): Promise<void>;

  /** Mark the trace complete. */
  end({ wsId, runId }: TraceScope): Promise<void>;

  /** Read the trace of a run in order; undefined when nothing was written. */
  get({ wsId, runId }: TraceScope): Promise<TracedReviewEvent[] | undefined>;

  /** Recorder bound to a run. onEvent receives each derived event. */
  recorder(
    scope: TraceScope,
    onEvent?: (event: TracedReviewEvent) => void,
  ): TraceRecorder;
}

/** Persist a KV entry per event. */
export class EventTraceStore implements TraceStore {
  #adapter: PersistenceAdapter;

  constructor(adapter: PersistenceAdapter) {
    this.#adapter = adapter;
  }

  async append({
    wsId,
    runId,
    event,
  }: TraceScope & { event: TracedReviewEvent }): Promise<void> {
    await this.#adapter.set(this.#eventKey(wsId, runId, event.seq), event);
  }

  async end(_scope: TraceScope): Promise<void> {
    // Events are already persisted.
  }

  async get({ wsId, runId }: TraceScope) {
    const { entries } = await this.#adapter.list<TracedReviewEvent>([
      TRACES,
      wsId,
      runId,
    ]);
    if (entries.length === 0) return undefined;
    return entries.map((e) => e.value);
  }

  recorder(
    scope: TraceScope,
    onEvent?: (event: TracedReviewEvent) => void,
  ): TraceRecorder {
    return new TraceRecorder(this, scope.wsId, scope.runId, onEvent);
  }

  #eventKey(wsId: string, runId: string, seq: number): string[] {
    return [TRACES, wsId, runId, String(seq).padStart(6, "0")];
  }
}

/** Mirrors agent_logger's pino event names for console parity. */
function logTraceEvent(event: TracedReviewEvent): void {
  switch (event.type) {
    case "node_end":
      if (event.run.status === "failed") {
        logger.debug(
          { node: event.nodeId, error: event.run.error },
          "node_end",
        );
      } else if (event.run.status === "skipped") {
        logger.debug(
          { node: event.nodeId, reason: event.run.reason },
          "node_end",
        );
      }
      break;
    case "custom":
      logCustom(event.nodeId, event.event);
      break;
    default:
      break;
  }
}

function logCustom(nodeId: string, event: ReviewNodeEvent): void {
  switch (event.type) {
    case "prompt":
      logger.debug({ node: nodeId, text: event.text }, "prompt");
      break;
    case "output":
      logger.debug({ node: nodeId, output: event.output }, "output");
      break;
    case "applied":
      logger.debug(
        { node: nodeId, attempts: event.attempts.length },
        "applied",
      );
      break;
    default:
      break;
  }
}

type CappedValue =
  | { value: unknown; truncated: false }
  | { value: string; truncated: true };

/** Payloads originate from parsed JSON, so stringify always yields a string. */
function capValue(value: unknown): CappedValue {
  const json = JSON.stringify(value);
  if (json.length <= MAX_PAYLOAD_CHARS) return { value, truncated: false };
  return { value: json.slice(0, MAX_PAYLOAD_CHARS), truncated: true };
}

/** Records the trace events of a run; record after flush is ignored. */
export class TraceRecorder implements ReviewTraceSink {
  #store: TraceStore;
  #wsId: string;
  #runId: string;
  #seq = 0;
  #onEvent: ((event: TracedReviewEvent) => void) | undefined;
  #writes = new SerialTasks();
  #flushed = false;

  constructor(
    store: TraceStore,
    wsId: string,
    runId: string,
    onEvent?: (event: TracedReviewEvent) => void,
  ) {
    this.#store = store;
    this.#wsId = wsId;
    this.#runId = runId;
    this.#onEvent = onEvent;
  }

  record(event: FlowEvent<ReviewTypes>): void {
    if (this.#flushed) return;
    const entry: TracedReviewEvent = {
      seq: this.#seq++,
      at: Date.now(),
      ...this.#capPayload(event),
    };
    logTraceEvent(entry);
    this.#onEvent?.(entry);
    // TODO -- use SerialTasks?
    // Appends are async; the queue keeps store order equal to seq order.
    this.#writes
      .add(() =>
        this.#store.append({
          wsId: this.#wsId,
          runId: this.#runId,
          event: entry,
        }),
      )
      .catch((err) => logger.error({ err }, "review trace append failed"));
  }

  #capPayload(event: FlowEvent<ReviewTypes>): FlowEvent<ReviewTypes> {
    if (event.type !== "custom" || event.event.type !== "output") {
      return event;
    }
    const capped = capValue(event.event.output);
    if (!capped.truncated) return event;
    return {
      ...event,
      event: { ...event.event, output: capped.value, truncated: true },
    };
  }

  /** Await pending appends and end. Never throws. */
  async flush(): Promise<void> {
    if (this.#flushed) return;
    this.#flushed = true;
    await this.#writes.drain();
    try {
      await this.#store.end({
        wsId: this.#wsId,
        runId: this.#runId,
      });
    } catch (err) {
      logger.error({ err }, "review trace end failed");
    }
  }
}
