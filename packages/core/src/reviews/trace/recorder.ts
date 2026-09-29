import type { FlowEvent } from "@/flow/types.ts";
import { logger } from "@/logger.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { SerialTasks } from "@/utils/serial.ts";
import { byteLength, keepHead, keepTail } from "@/utils/truncate.ts";
import { logTraceEvent } from "./log.ts";
import type {
  TraceEvent,
  TraceRecorder,
  TraceScope,
  TraceStore,
} from "./types.ts";

// Deno KV caps a value at 64 KiB. Truncation measures the serialized
// entry directly, so the cap is the only budget; no escape gap guess.
export const MAX_ENTRY_BYTES = 64 * 1024;

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
    const entry = this.#fit({
      seq: this.#seq++,
      at: Date.now(),
      ...event,
    });
    logTraceEvent(entry);
    this.#onEvent?.(entry);
    // Appends are async; the queue keeps store order equal to seq order.
    this.#writes
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

  /**
   * Caps the payload of custom events with model content so the
   * serialized entry stays under the KV value cap. Prompts keep their
   * head, reasoning keeps its tail, outputs keep a JSON prefix.
   *
   * The kept length is chosen by measuring the fully serialized entry,
   * because JSON escaping can expand the payload after the raw-byte
   * slice is taken (a newline or quote becomes two or more bytes).
   */
  #fit(entry: TraceEvent): TraceEvent {
    if (byteLength(JSON.stringify(entry)) <= MAX_ENTRY_BYTES) return entry;
    if (entry.type !== "custom") return entry;

    const event = entry.event;
    switch (event.type) {
      case "prompt":
        return this.#shrink(
          event.text,
          (kept) => ({
            ...entry,
            event: { ...event, text: kept, truncated: true },
          }),
          "head",
          entry,
        );
      case "reasoning":
        return this.#shrink(
          event.text,
          (kept) => ({
            ...entry,
            event: { ...event, text: kept, truncated: true },
          }),
          "tail",
          entry,
        );
      case "output": {
        const json = JSON.stringify(event.output);
        return this.#shrink(
          json,
          (kept) => ({
            ...entry,
            event: { ...event, output: kept, truncated: true },
          }),
          "head",
          entry,
        );
      }
      default:
        return entry;
    }
  }

  /**
   * Finds the largest head or tail slice whose entry serializes to at
   * most MAX_ENTRY_BYTES. Bisection is over the raw-byte length fed to
   * keepHead/keepTail, so it lands on the largest kept payload whose
   * serialized form, escaping included, still fits.
   */
  #shrink(
    text: string,
    build: (kept: string) => TraceEvent,
    side: "head" | "tail",
    original: TraceEvent,
  ): TraceEvent {
    const fits = (candidate: TraceEvent): boolean =>
      byteLength(JSON.stringify(candidate)) <= MAX_ENTRY_BYTES;

    let best = build("");
    // An entry whose non-payload fields already exceed the cap cannot
    // be saved by shrinking; leave it for the store to reject loudly.
    if (!fits(best)) return original;

    const take = (maxBytes: number): string =>
      side === "head"
        ? keepHead(text, maxBytes).text
        : keepTail(text, maxBytes).text;

    // Serialized size grows with the kept length, so bisect the byte
    // budget for the largest slice that still fits.
    let lo = 0;
    let hi = byteLength(text);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = build(take(mid));
      if (fits(candidate)) {
        best = candidate;
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }
}
