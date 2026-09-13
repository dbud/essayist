import type { Mark } from "@essayist/core";
import { createModel, effect, signal, untracked } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import type { FileKey } from "@/signals/file.ts";
import { getFile } from "@/signals/file.ts";
import { get, modelData, namespace } from "@/signals/models.ts";
import { asyncComputed } from "@/utils/asyncComputed.ts";
import { deepComputed } from "@/utils/deepComputed.ts";
import { ensureOk } from "@/utils/ensureOk.ts";
import { resolveMarksViaWorker } from "@/wasm/client.ts";

export interface MarksData {
  marks: Mark[];
  versionId: string;
  content: string;
}

export const marksNs = namespace<MarksData, FileKey>("marks");

export const MarksModel = createModel((workspaceId: string, path: string) => {
  const { checkpoint, markdown } = getFile(workspaceId, path);

  const baseline = signal<MarksData>({
    marks: [],
    versionId: "",
    content: "",
  });

  const { loading, error, refresh } = modelData(
    marksNs,
    { workspaceId, path },
    (data) => (baseline.value = data),
    async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}/marks`,
      );
      await ensureOk(res);
      return (await res.json()) as MarksData;
    },
  );

  // Marks ship resolved; the resolver only re-anchors diverged (draft) content.
  const { value: reanchored, stale: resolving } = asyncComputed(
    () =>
      [baseline.value.marks, baseline.value.content, markdown.value] as const,
    ([marks, oldContent, newContent], signal) =>
      resolveMarksViaWorker(marks, oldContent, newContent, signal),
    { debounce: 60, initial: [] as Mark[] },
  );

  const resolved = deepComputed(() =>
    markdown.value === baseline.value.content
      ? baseline.value.marks
      : reanchored.value,
  );

  // Marks are migrated server-side on write, so refetch when the baseline
  // version differs from the checkpoint.
  if (IS_BROWSER) {
    effect(() => {
      const versionId = checkpoint.value?.version_id;
      if (!versionId) return;
      if (baseline.value.versionId === versionId) return;
      // untracked: refresh()'s runner state writes must not re-trigger
      untracked(() => void refresh());
    });
  }

  return { resolved, loading, error, refresh, resolving };
});

export function getMarks(workspaceId: string, path: string) {
  return get(
    marksNs,
    { workspaceId, path },
    () => new MarksModel(workspaceId, path),
  );
}
