const observed = new Set<string>();

export function observeReviewRun(wsId: string, runId: string): void {
  const key = `${wsId}/${runId}`;
  if (observed.has(key)) return;
  observed.add(key);
  const source = new EventSource(`/api/streams/review-runs/${wsId}/${runId}`);

  for (const type of ["trace", "done"] as const) {
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
