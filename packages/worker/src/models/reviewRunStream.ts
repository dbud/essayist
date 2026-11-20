import type { ReviewProgress } from "@essayist/core";
import { createModel, effect, signal } from "@preact/signals";

import type { ReviewRunData, ReviewStreamDetail } from "./reviewRuns.data.ts";

/** The live stream of a running review: its progress, and the run once it settles. */
export const ReviewRunStreamModel = createModel(
  (wsId: string, runId: string, detail: ReviewStreamDetail) => {
    const progress = signal<ReviewProgress | null>(null);
    const settled = signal<ReviewRunData | null>(null);

    effect(() => {
      const key = `${wsId}/${runId}`;
      const query = detail === "trace" ? "?detail=trace" : "";
      const source = new EventSource(`/api/streams/review-runs/${wsId}/${runId}${query}`);

      // Frames are cast like api responses: the server validates what it sends.
      source.addEventListener("progress", (event) => {
        console.log(`[review-stream] ${key} progress (id ${event.lastEventId})`, event.data);
        progress.value = JSON.parse(event.data) as ReviewProgress;
      });
      source.addEventListener("done", (event) => {
        console.log(`[review-stream] ${key} done`, event.data);
        source.close();
        settled.value = JSON.parse(event.data) as ReviewRunData;
      });
      source.addEventListener("trace", (event) => {
        console.log(`[review-stream] ${key} trace (id ${event.lastEventId})`, event.data);
      });
      source.addEventListener("error", () => {
        // The browser reconnects on its own; this only marks the state.
        console.log(`[review-stream] ${key} error (readyState ${source.readyState})`);
      });

      return () => source.close();
    });

    return { progress, settled };
  },
);

export type ReviewRunStream = InstanceType<typeof ReviewRunStreamModel>;
