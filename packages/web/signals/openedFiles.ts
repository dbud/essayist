import { computed, createModel, effect } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { get, namespace } from "@/signals/models.ts";
import { leftSidebarOpened } from "@/signals/sidebar.ts";
import { getWorkspaces } from "@/signals/workspace.ts";
import { persistentSignal } from "@/utils/persistentSignal.ts";

export const openedFilesNs = namespace("openedFiles");

export const OpenedFilesModel = createModel((workspaceId: string) => {
  const tree = getFileTreeFor(workspaceId);
  const opened = persistentSignal<string[]>(`openedFiles:${workspaceId}`, []);
  const history = persistentSignal<string[]>(`fileHistory:${workspaceId}`, []);

  // Projection of the tree model's selection; "" while nothing is selected.
  // TODO -- cleanup
  const selected = computed(() => tree.selectedPath.value ?? "");

  function open(path: string) {
    tree.select(path);
    const current = opened.value;
    if (!current.includes(path)) {
      opened.value = [...current, path];
    }
    history.value = [path, ...history.value.filter((p) => p !== path)];
  }

  function close(path: string) {
    const remaining = opened.value.filter((p) => p !== path);
    opened.value = remaining;
    history.value = history.value.filter((p) => p !== path);
    if (selected.value === path) {
      const mostRecent = history.value.find((p) => remaining.includes(p));
      tree.select(mostRecent ?? remaining[0] ?? null);
    }
  }

  return { opened, selected, open, close };
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

// Module-level (not per-instance) so multiple workspace instances don't fight
// over the global sidebar signal. When a workspace has no opened files, expand
// the left sidebar so the file browser is visible to pick one.
if (IS_BROWSER) {
  effect(() => {
    const wsId = getWorkspaces().selectedId.value;
    if (!wsId) return;
    const of = getOpenedFilesFor(wsId);
    of.opened.value; // track so opening the first file can re-collapse it
    if (of.opened.value.length === 0) leftSidebarOpened.value = true;
  });

  // Keep the opened-tabs list in sync with a seeded or restored selection.
  effect(() => {
    const of = getOpenedFiles();
    if (!of) return;
    const selected = of.selected.value;
    if (selected && !of.opened.value.includes(selected)) of.open(selected);
  });

  // Auto-select the first file once the tree is settled and nothing is selected.
  effect(() => {
    const wsId = getWorkspaces().selectedId.value;
    if (!wsId) return;
    const tree = getFileTreeFor(wsId);
    if (tree.loading.value || tree.selectedPath.value) return;
    const files = tree.files.value;
    if (files.length > 0) getOpenedFilesFor(wsId).open(files[0].path);
  });
}
