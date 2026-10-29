import type { ReviewRun } from "@essayist/core";
import { type Signal, signal } from "@preact/signals";

// TODO -- ESS-94: the review api and the review runs model land with the review runner; the history
// is empty meanwhile.
const runs = signal<ReviewRun[]>([]);
const historyLoading = signal(false);

export function getReview(
  _wsId: string,
  _path: string,
): { runs: Signal<ReviewRun[]>; historyLoading: Signal<boolean> } {
  return { runs, historyLoading };
}
