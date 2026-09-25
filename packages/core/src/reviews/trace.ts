import { logger } from "@/logger.ts";
import type { PersistenceAdapter } from "@/persistence/mod.ts";
import type {
  ReviewTraceEvent,
  ReviewTraceSink,
  TracedReviewEvent,
} from "./types.ts";

// Key layout:
//   ["review_traces", wsId, runId, "000000"] -> TracedReviewEvent
const TRACES = "review_traces";

// Deno KV values cap at 64 KiB. Step outputs embed structured artifacts,
// so oversized payloads are elided here.
const MAX_PAYLOAD_CHARS = 16_000;

/** The run a trace belongs to. */
export interface TraceScope {
  wsId: string;
  runId: string;
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
function logTraceEvent(event: ReviewTraceEvent): void {
  switch (event.type) {
    case "step_input":
      logger.debug({ step: event.stepId, input: event.text }, "step_input");
      break;
    case "step_output":
      logger.debug({ step: event.stepId, output: event.output }, "step_output");
      break;
    case "marks_applied":
      logger.debug(
        { step: event.stepId, attempts: event.attempts.length },
        "marks_applied",
      );
      break;
    case "step_error":
      logger.debug({ step: event.stepId, error: event.error }, "step_error");
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
  #writes: Promise<void> = Promise.resolve();
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

  record(event: ReviewTraceEvent): void {
    if (this.#flushed) return;
    const entry: TracedReviewEvent = {
      seq: this.#seq++,
      at: Date.now(),
      ...this.#capPayload(event),
    };
    logTraceEvent(entry);
    this.#onEvent?.(entry);
    // Appends are async; chain them to keep store order equal to seq order.
    this.#writes = this.#writes
      .then(() =>
        this.#store.append({
          wsId: this.#wsId,
          runId: this.#runId,
          event: entry,
        }),
      )
      .catch((err) => logger.error({ err }, "review trace append failed"));
  }

  #capPayload(event: ReviewTraceEvent): ReviewTraceEvent {
    if (event.type !== "step_output") return event;
    const capped = capValue(event.output);
    if (!capped.truncated) return event;
    return { ...event, output: capped.value, truncated: true };
  }

  /** Await pending appends and end. Never throws. */
  async flush(): Promise<void> {
    if (this.#flushed) return;
    this.#flushed = true;
    try {
      await this.#writes;
    } catch (err) {
      logger.error({ err }, "review trace append failed");
    }
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
