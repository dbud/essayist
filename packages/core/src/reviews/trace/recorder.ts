import type { FlowEvent } from "@/flow/types.ts";
import { logger } from "@/logger.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { SerialTasks } from "@/utils/serial.ts";
import { logTraceEvent } from "./log.ts";
import type {
  TraceEvent,
  TraceRecorder,
  TraceScope,
  TraceStore,
} from "./types.ts";

// Deno KV values cap at 64 KiB. Outputs embed structured artifacts,
// so oversized payloads are elided here.
const MAX_PAYLOAD_CHARS = 16_000;

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
export class ScopedTraceRecorder implements TraceRecorder {
  #store: TraceStore;
  #scope: TraceScope;
  #seq = 0;
  #onEvent: ((event: TraceEvent) => void) | undefined;
  #writes = new SerialTasks();
  #flushed = false;

  constructor(
    store: TraceStore,
    scope: TraceScope,
    onEvent?: (event: TraceEvent) => void,
  ) {
    this.#store = store;
    this.#scope = scope;
    this.#onEvent = onEvent;
  }

  record(event: FlowEvent<ReviewTypes>): void {
    if (this.#flushed) return;
    const entry: TraceEvent = {
      seq: this.#seq++,
      at: Date.now(),
      ...this.#capPayload(event),
    };
    logTraceEvent(entry);
    this.#onEvent?.(entry);
    // Appends are async; the queue keeps store order equal to seq order.
    this.#writes
      .add(() => this.#store.append({ ...this.#scope, event: entry }))
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
      await this.#store.end(this.#scope);
    } catch (err) {
      logger.error({ err }, "review trace end failed");
    }
  }
}
