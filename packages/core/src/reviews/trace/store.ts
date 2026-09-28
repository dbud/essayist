import type { PersistenceAdapter } from "@/persistence/mod.ts";
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

/** Persist a KV entry per event. */
export class TraceEventStore implements TraceStore {
  #adapter: PersistenceAdapter;

  constructor(adapter: PersistenceAdapter) {
    this.#adapter = adapter;
  }

  async append({
    wsId,
    runId,
    event,
  }: TraceScope & { event: TraceEvent }): Promise<void> {
    await this.#adapter.set(this.#eventKey(wsId, runId, event.seq), event);
  }

  async end(_scope: TraceScope): Promise<void> {
    // Events are already persisted.
  }

  async get({ wsId, runId }: TraceScope) {
    const { entries } = await this.#adapter.list<TraceEvent>([
      TRACES,
      wsId,
      runId,
    ]);
    if (entries.length === 0) return undefined;
    return entries.map((e) => e.value);
  }

  recorder(
    scope: TraceScope,
    onEvent?: (event: TraceEvent) => void,
  ): TraceRecorder {
    return new ScopedTraceRecorder(this, scope, onEvent);
  }

  #eventKey(wsId: string, runId: string, seq: number): string[] {
    return [TRACES, wsId, runId, String(seq).padStart(6, "0")];
  }
}
