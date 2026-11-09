import type { TraceEvent } from "@essayist/core";

import type { ReviewRunData } from "./reviewRuns.data.ts";

export interface ReviewStreamHooks {
  onTrace?: (event: TraceEvent) => void;
  onPing?: () => void;
  onSettled?: (run: ReviewRunData) => void;
}

const observed = new Set<string>();

export function observeReviewRun(wsId: string, runId: string, hooks: ReviewStreamHooks = {}): void {
  const key = `${wsId}/${runId}`;
  if (observed.has(key)) return;
  observed.add(key);
  const source = new EventSource(`/api/streams/review-runs/${wsId}/${runId}`);

  source.addEventListener("trace", (event) => {
    console.log(`[review-stream] ${key} trace (id ${event.lastEventId})`, event.data);
    hooks.onTrace?.(JSON.parse(event.data) as TraceEvent);
  });
  source.addEventListener("ping", () => {
    hooks.onPing?.();
  });
  source.addEventListener("done", (event) => {
    console.log(`[review-stream] ${key} done (id ${event.lastEventId})`, event.data);
    hooks.onSettled?.(JSON.parse(event.data) as ReviewRunData);
    source.close();
    observed.delete(key);
  });

  source.addEventListener("error", () => {
    // The browser reconnects on its own; this only marks the state.
    console.log(`[review-stream] ${key} error (readyState ${source.readyState})`);
  });
}
