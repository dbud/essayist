import type { ReviewProgress, ReviewRun } from "@essayist/core";
import { createModel, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { getMarks } from "@/signals/marks.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { ensureOk } from "@/utils/ensureOk.ts";
import { parseSSE } from "@/utils/sse.ts";

export const ReviewModel = createModel((workspaceId: string, path: string) => {
  const run = signal<ReviewRun | null>(null);
  const progress = signal<ReviewProgress | null>(null);
  const runs = signal<ReviewRun[]>([]);
  const [runAsync, { loading, error }] = createAsyncState();
  const [historyAsync, { loading: historyLoading, error: historyError }] =
    createAsyncState(true);

  async function loadHistory() {
    const result = await historyAsync(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/review-runs?file=${encodeURIComponent(
          path,
        )}`,
      );
      await ensureOk(res);
      return (await res.json()) as ReviewRun[];
    });
    if (result) runs.value = result;
  }

  async function submit() {
    const result = await runAsync(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}/review`,
        { method: "POST" },
      );
      await ensureOk(res);
      if (!res.body) throw new Error("Empty review response");

      let done: ReviewRun | undefined;
      for await (const { event, data } of parseSSE(res.body)) {
        if (event === "progress") progress.value = data as ReviewProgress;
        if (event === "done") done = data as ReviewRun;
        if (event === "error") {
          throw new Error((data as { error: string }).error);
        }
      }
      if (!done) throw new Error("Review stream ended without a result");
      return done;
    });

    progress.value = null;
    if (result) {
      run.value = result;
      if (result.status === "completed") getMarks(workspaceId, path).reload();
      void loadHistory();
    }
  }

  if (IS_BROWSER) void loadHistory();

  return {
    run,
    runs,
    progress,
    loading,
    error,
    historyLoading,
    historyError,
    submit,
    reloadHistory: loadHistory,
  };
});

const cache = new Map<string, InstanceType<typeof ReviewModel>>();

export function getReview(workspaceId: string, path: string) {
  const key = `${workspaceId}:${path}`;
  return cache.getOrInsertComputed(
    key,
    () => new ReviewModel(workspaceId, path),
  );
}
