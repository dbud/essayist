import type { FlowEvent } from "@/flow/types.ts";
import { logger } from "@/logger.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { logTraceEvent } from "./log.ts";
import type {
  TraceEvent,
  TraceRecorder,
  TraceScope,
  TraceStore,
} from "./types.ts";

/** Records the trace events of a run. */
export class ScopedTraceRecorder implements TraceRecorder {
  #store: TraceStore;
  #scope: TraceScope;
  #seq: number;
  #onEvent: ((event: TraceEvent) => void) | undefined;

  constructor(
    store: TraceStore,
    scope: TraceScope,
    onEvent?: (event: TraceEvent) => void,
    seq = 0,
  ) {
    this.#store = store;
    this.#scope = scope;
    this.#seq = seq;
    this.#onEvent = onEvent;
  }

  async record(event: FlowEvent<ReviewTypes>): Promise<void> {
    const entry: TraceEvent = {
      seq: this.#seq++,
      at: Date.now(),
      ...event,
    };
    logTraceEvent(entry);
    this.#onEvent?.(entry);
    try {
      await this.#store.append({ ...this.#scope, event: entry });
    } catch (err) {
      logger.error({ err }, "review trace append failed");
    }
  }
}
