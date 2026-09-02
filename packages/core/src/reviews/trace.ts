import type {
  CorrelatedResponseStreamEvent,
  ModelResult,
  OutputItems,
  ResponseOutputText,
  Tool,
  Usage,
} from "@openrouter/agent";
import {
  isToolCallOutputEvent,
  isTurnEndEvent,
  isTurnStartEvent,
} from "@openrouter/agent";
import { logger } from "@/logger.ts";
import type { PersistenceAdapter } from "@/persistence/mod.ts";
import type {
  ReviewTraceEvent,
  ReviewTraceSink,
  ReviewTraceUsage,
  TracedReviewEvent,
} from "./types.ts";

// Key layout:
//   ["review_traces", wsId, runId, "000000"] -> TracedReviewEvent
const TRACES = "review_traces";

// Deno KV values cap at 64 KiB. Tool outputs embed whole file contents,
// which the VFS already holds, so oversized payloads are elided here.
const MAX_PAYLOAD_CHARS = 16_000;

/** The run a trace belongs to. */
export interface TraceScope {
  workspaceId: string;
  runId: string;
}

/**
 * Storage strategy for review traces.
 *
 * TODO -- blob strategy: buffer appends, commit one chunked blob in end().
 */
export interface TraceStore {
  /** Append one event; calls arrive in seq order. */
  append({
    workspaceId,
    runId,
    event,
  }: TraceScope & { event: TracedReviewEvent }): Promise<void>;

  /** Mark the trace complete. */
  end({ workspaceId, runId }: TraceScope): Promise<void>;

  /** Read a run's trace in order; undefined when nothing was written. */
  get({
    workspaceId,
    runId,
  }: TraceScope): Promise<TracedReviewEvent[] | undefined>;

  /** Recorder bound to one run. onEvent receives each derived event. */
  recorder(
    scope: TraceScope,
    onEvent?: (event: TracedReviewEvent) => void,
  ): TraceRecorder;
}

/** Persist one KV entry per event. */
export class EventTraceStore implements TraceStore {
  #adapter: PersistenceAdapter;

  constructor(adapter: PersistenceAdapter) {
    this.#adapter = adapter;
  }

  async append({
    workspaceId,
    runId,
    event,
  }: TraceScope & { event: TracedReviewEvent }): Promise<void> {
    await this.#adapter.set(
      this.#eventKey(workspaceId, runId, event.seq),
      event,
    );
  }

  async end(_scope: TraceScope): Promise<void> {
    // Events are already persisted.
  }

  async get({ workspaceId, runId }: TraceScope) {
    const { entries } = await this.#adapter.list<TracedReviewEvent>([
      TRACES,
      workspaceId,
      runId,
    ]);
    if (entries.length === 0) return undefined;
    return entries.map((e) => e.value);
  }

  recorder(
    scope: TraceScope,
    onEvent?: (event: TracedReviewEvent) => void,
  ): TraceRecorder {
    return new TraceRecorder(this, scope.workspaceId, scope.runId, onEvent);
  }

  #eventKey(workspaceId: string, runId: string, seq: number): string[] {
    return [TRACES, workspaceId, runId, String(seq).padStart(6, "0")];
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function mapUsage(usage: Usage): ReviewTraceUsage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
    cachedTokens: usage.inputTokensDetails?.cachedTokens ?? 0,
    reasoningTokens: usage.outputTokensDetails?.reasoningTokens ?? 0,
    ...(usage.cost != null ? { cost: usage.cost } : {}),
  };
}

/** Models emit malformed JSON; keep the raw text rather than dropping it. */
function parseJsonOrRaw(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
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

/** Mirrors agent_logger's pino event names for console parity. */
function logTraceEvent(event: ReviewTraceEvent): void {
  switch (event.type) {
    case "input":
      logger.debug({ input: event.text }, "agent_call");
      break;
    case "tool_call":
      logger.debug(
        { fn: event.name, callId: event.callId, args: event.args },
        "function_call",
      );
      break;
    case "tool_output":
      logger.debug(
        { callId: event.callId, output: event.output },
        "function_call_output",
      );
      break;
    case "message":
      logger.debug({ text: event.text }, "message");
      break;
    case "reasoning":
      logger.debug({ text: event.text }, "reasoning");
      break;
    default:
      break;
  }
}

/**
 * Records one run's trace events. Consumes the model result's stream as a
 * side consumer while the runner reads getText() concurrently.
 */
export class TraceRecorder implements ReviewTraceSink {
  #store: TraceStore;
  #workspaceId: string;
  #runId: string;
  #seq = 0;
  #round = 0;
  #onEvent: ((event: TracedReviewEvent) => void) | undefined;
  #writes: Promise<void> = Promise.resolve();
  #consumer: Promise<void> | undefined;
  #flushPromise: Promise<void> | undefined;
  #flushed = false;

  constructor(
    store: TraceStore,
    workspaceId: string,
    runId: string,
    onEvent?: (event: TracedReviewEvent) => void,
  ) {
    this.#store = store;
    this.#workspaceId = workspaceId;
    this.#runId = runId;
    this.#onEvent = onEvent;
  }

  record(event: ReviewTraceEvent): void {
    if (this.#flushed) return;
    const entry: TracedReviewEvent = {
      seq: this.#seq++,
      at: Date.now(),
      ...event,
    };
    logTraceEvent(entry);
    this.#onEvent?.(entry);
    // Appends are async; chain them to keep store order equal to seq order.
    this.#writes = this.#writes
      .then(() =>
        this.#store.append({
          workspaceId: this.#workspaceId,
          runId: this.#runId,
          event: entry,
        }),
      )
      .catch((err) => logger.error({ err }, "review trace append failed"));
  }

  /** Consume the result's stream. Call once, before flush(). */
  follow(result: ModelResult<readonly Tool[]>): void {
    this.#consumer = this.#consume(result);
  }

  /** Await stream consumption and pending appends, then end. Never throws. */
  flush(): Promise<void> {
    this.#flushPromise ??= this.#doFlush();
    return this.#flushPromise;
  }

  async #doFlush(): Promise<void> {
    if (this.#consumer) {
      try {
        await this.#consumer;
      } catch (err) {
        logger.error({ err }, "review trace consumer failed");
      }
    }
    try {
      await this.#writes;
    } catch (err) {
      logger.error({ err }, "review trace append failed");
    }
    try {
      await this.#store.end({
        workspaceId: this.#workspaceId,
        runId: this.#runId,
      });
    } catch (err) {
      logger.error({ err }, "review trace end failed");
    }
    this.#flushed = true;
  }

  async #consume(result: ModelResult<readonly Tool[]>): Promise<void> {
    try {
      for await (const event of result.getFullResponsesStream()) {
        this.#handleStreamEvent(event);
      }
    } catch (err) {
      logger.error({ err }, "review trace stream error");
      this.record({
        type: "error",
        round: this.#round,
        error: errorMessage(err),
      });
    }
  }

  #handleStreamEvent(event: CorrelatedResponseStreamEvent<readonly Tool[]>) {
    if (isTurnStartEvent(event)) {
      this.#round = event.turnNumber;
      this.record({ type: "round_start", round: event.turnNumber });
      return;
    }
    if (isTurnEndEvent(event)) {
      this.record({ type: "round_end", round: event.turnNumber });
      return;
    }
    if (isToolCallOutputEvent(event)) {
      const raw = event.output.output;
      const parsed = typeof raw === "string" ? parseJsonOrRaw(raw) : raw;
      const capped = capValue(parsed);
      this.record({
        type: "tool_output",
        round: this.#round,
        callId: event.output.callId,
        output: capped.value,
        ...(capped.truncated ? { truncated: true } : {}),
      });
      return;
    }
    if (event.type === "response.output_item.done") {
      this.#handleItem(event.item);
      return;
    }
    if (event.type === "response.completed") {
      const usage = event.response.usage;
      if (usage) {
        this.record({
          type: "usage",
          round: this.#round,
          usage: mapUsage(usage),
        });
      }
      return;
    }
    if (event.type === "response.failed") {
      this.record({
        type: "error",
        round: this.#round,
        error: JSON.stringify(event.response.error ?? event.response),
      });
    }
  }

  #handleItem(item: OutputItems): void {
    if (item.type === "message") {
      const text = item.content
        .filter((c): c is ResponseOutputText => c.type === "output_text")
        .map((c) => c.text)
        .join("");
      this.record({ type: "message", round: this.#round, text });
      return;
    }
    if (item.type === "reasoning") {
      const content = (item.content ?? []).map((c) => c.text).join("");
      const summary = item.summary.map((c) => c.text).join("");
      const text = [content, summary].filter(Boolean).join("\n");
      if (text) this.record({ type: "reasoning", round: this.#round, text });
      return;
    }
    if (item.type === "function_call") {
      const parsed = parseJsonOrRaw(item.arguments || "{}");
      const capped = capValue(parsed);
      this.record({
        type: "tool_call",
        round: this.#round,
        callId: item.callId,
        name: item.name,
        args: capped.value,
        ...(capped.truncated ? { truncated: true } : {}),
      });
    }
  }
}
