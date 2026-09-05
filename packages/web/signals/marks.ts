import type { Mark } from "@essayist/core";
import { createModel, effect, signal, untracked } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { getFile } from "@/signals/file.ts";
import { asyncComputed } from "@/utils/asyncComputed.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { ensureOk } from "@/utils/ensureOk.ts";
import { resolveMarksViaWorker } from "@/wasm/client.ts";

export const MarksModel = createModel((workspaceId: string, path: string) => {
  const { markdown, snapshot } = getFile(workspaceId, path);
  const [run, { loading, error }] = createAsyncState(true);

  const loaded = signal<{ marks: Mark[]; content: string }>({
    marks: [],
    content: "",
  });

  const { value: resolved, stale: resolving } = asyncComputed(
    () => [loaded.value.marks, loaded.value.content, markdown.value] as const,
    ([marks, oldContent, newContent], signal) =>
      resolveMarksViaWorker(marks, oldContent, newContent, signal),
    { debounce: 60, initial: [] as Mark[] },
  );

  async function load(content = snapshot.value?.content ?? ""): Promise<void> {
    const result = await run(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}/marks`,
      );
      await ensureOk(res);
      return (await res.json()) as Mark[];
    });
    if (result === undefined) return;
    loaded.value = { marks: result, content };
  }

  // Marks are migrated on write server-side, so reload whenever the snapshot changes.
  if (IS_BROWSER) {
    effect(() => {
      const content = snapshot.value?.content;
      if (content === undefined) return;
      // untracked: load()'s runner state writes must not re-trigger this effect
      untracked(() => void load(content));
    });
  }

  return { resolved, loading, error, reload: load, resolving };
});

const cache = new Map<string, InstanceType<typeof MarksModel>>();

export function getMarks(workspaceId: string, path: string) {
  const key = `${workspaceId}:${path}`;
  return cache.getOrInsertComputed(
    key,
    () => new MarksModel(workspaceId, path),
  );
}
