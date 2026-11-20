import type { ReviewStreamDetail } from "./reviewRuns.data.ts";

const observed = new Set<string>();

export function observeReviewRun(wsId: string, runId: string, detail: ReviewStreamDetail): void {
  const key = `${wsId}/${runId}`;
  if (observed.has(key)) return;
  observed.add(key);
  const query = detail === "trace" ? "?detail=trace" : "";
  const source = new EventSource(`/api/streams/review-runs/${wsId}/${runId}${query}`);

  for (const type of ["trace", "progress", "done"] as const) {
    source.addEventListener(type, (event) => {
      console.log(`[review-stream] ${key} ${type} (id ${event.lastEventId})`, event.data);
      if (type === "done") {
        source.close();
        observed.delete(key);
      }
    });
  }

  source.addEventListener("error", () => {
    // The browser reconnects on its own; this only marks the state.
    console.log(`[review-stream] ${key} error (readyState ${source.readyState})`);
  });
}
