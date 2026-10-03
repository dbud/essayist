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

  record(event: FlowEvent<ReviewTypes>): Promise<void> {
    if (this.#flushed) return Promise.resolve();
    const entry: TraceEvent = {
      seq: this.#seq++,
      at: Date.now(),
      ...event,
    };
    logTraceEvent(entry);
    this.#onEvent?.(entry);
    // Appends are async; the queue keeps store order equal to seq order.
    return this.#writes
      .add(() => this.#store.append({ ...this.#scope, event: entry }))
      .catch((err) => logger.error({ err }, "review trace append failed"));
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
