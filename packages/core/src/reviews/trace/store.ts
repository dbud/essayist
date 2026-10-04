import { sortBy } from "@std/collections";
import type { PersistenceAdapter } from "@/persistence/mod.ts";
import { ChunkedValueStore } from "@/persistence/value_store.ts";
import { ScopedTraceRecorder } from "./recorder.ts";
import type {
  TraceEvent,
  TraceRecorder,
  TraceScope,
  TraceStore,
} from "./types.ts";

// Key layout:
//   ["review_traces", wsId, runId, "000000"] -> TraceEvent
const TRACES = "review_traces";

/** Persist a KV entry per event, split when it does not fit. */
export class TraceEventStore implements TraceStore {
  #values: ChunkedValueStore<TraceEvent>;

  constructor(adapter: PersistenceAdapter) {
    this.#values = new ChunkedValueStore<TraceEvent>(adapter);
  }

  async append({
    wsId,
    runId,
    event,
  }: TraceScope & { event: TraceEvent }): Promise<void> {
    await this.#values.put(this.#eventKey(wsId, runId, event.seq), event);
  }

  async get({ wsId, runId }: TraceScope) {
    const stored = await this.#values.list([TRACES, wsId, runId]);
    if (stored.length === 0) return undefined;
    return sortBy(stored, (entry) => entry.value.seq).map(
      (entry) => entry.value,
    );
  }

  recorder(
    scope: TraceScope,
    onEvent?: (event: TraceEvent) => void,
    seq = 0,
  ): TraceRecorder {
    return new ScopedTraceRecorder(this, scope, onEvent, seq);
  }

  #eventKey(wsId: string, runId: string, seq: number): string[] {
    return [TRACES, wsId, runId, String(seq).padStart(6, "0")];
  }
}
