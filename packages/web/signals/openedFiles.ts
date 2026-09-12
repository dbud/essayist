import { computed, createModel } from "@preact/signals";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { get, namespace } from "@/signals/models.ts";
import { getWorkspaces } from "@/signals/workspace.ts";
import { persistentSignal } from "@/utils/persistentSignal.ts";

export const openedFilesNs = namespace("openedFiles");

export const OpenedFilesModel = createModel((workspaceId: string) => {
  const tree = getFileTreeFor(workspaceId);
  const tabs = persistentSignal<string[]>(`openedFiles:${workspaceId}`, []);
  const history = persistentSignal<string[]>(`fileHistory:${workspaceId}`, []);

  const opened = computed(() => {
    const selected = tree.selectedPath.value;
    if (!selected || tabs.value.includes(selected)) return tabs.value;
    return [selected, ...tabs.value];
  });

  function open(path: string) {
    tree.select(path);
    if (!tabs.value.includes(path)) {
      tabs.value = [...tabs.value, path];
    }
    history.value = [path, ...history.value.filter((p) => p !== path)];
  }

  function close(path: string) {
    const remaining = tabs.value.filter((p) => p !== path);
    tabs.value = remaining;
    history.value = history.value.filter((p) => p !== path);
    if (tree.selectedPath.value === path) {
      const mostRecent = history.value.find((p) => remaining.includes(p));
      const next = mostRecent ?? remaining[0] ?? null;
      tree.select(next);
    }
  }

  return { opened, open, close };
});

export type OpenedFiles = InstanceType<typeof OpenedFilesModel>;

export function getOpenedFilesFor(workspaceId: string): OpenedFiles {
  return get(
    openedFilesNs,
    workspaceId,
    () => new OpenedFilesModel(workspaceId),
  );
}

// Returns `null` while no workspace is selected (bootstrap, login page).
export function getOpenedFiles(): OpenedFiles | null {
  const wsId = getWorkspaces().selectedId.value;
  return wsId ? getOpenedFilesFor(wsId) : null;
}
