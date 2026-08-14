import type { ReviewRun } from "@essayist/core";
import { createModel, signal } from "@preact/signals";
import { getMarks } from "@/signals/marks.ts";
import createAsyncState from "@/utils/asyncState.ts";

export const ReviewModel = createModel((workspaceId: string, path: string) => {
  const run = signal<ReviewRun | null>(null);
  const [runAsync, { loading, error }] = createAsyncState();

  async function submit() {
    const result = await runAsync(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}/review`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as ReviewRun;
    });
    if (result) {
      run.value = result;
      if (result.status === "completed") getMarks(workspaceId, path).reload();
    }
  }

  return { run, loading, error, submit };
});

const cache = new Map<string, InstanceType<typeof ReviewModel>>();

export function getReview(workspaceId: string, path: string) {
  const key = `${workspaceId}:${path}`;
  return cache.getOrInsertComputed(
    key,
    () => new ReviewModel(workspaceId, path),
  );
}
