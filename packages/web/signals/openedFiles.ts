import { createModel, effect } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { sidebarCollapsed, sidebarOverlayOpen } from "@/signals/sidebar.ts";
import { workspaces } from "@/signals/workspace.ts";
import { persistentSignal } from "@/utils/persistentSignal.ts";

export const OpenedFilesModel = createModel((workspaceId: string) => {
  const selected = persistentSignal(`selectedFile:${workspaceId}`, "");
  const opened = persistentSignal<string[]>(`openedFiles:${workspaceId}`, []);
  const history = persistentSignal<string[]>(`fileHistory:${workspaceId}`, []);

  function open(path: string) {
    selected.value = path;
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
      selected.value = mostRecent ?? remaining[0] ?? "";
    }
  }

  return { opened, selected, open, close };
});

const cache = new Map<string, OpenedFiles>();

export type OpenedFiles = InstanceType<typeof OpenedFilesModel>;

export function getOpenedFilesFor(workspaceId: string): OpenedFiles {
  return cache.getOrInsertComputed(
    workspaceId,
    () => new OpenedFilesModel(workspaceId),
  );
}

// Returns `null` while no workspace is selected (bootstrap, login page).
export function getOpenedFiles(): OpenedFiles | null {
  const wsId = workspaces.currentWorkspaceId.value;
  return wsId ? getOpenedFilesFor(wsId) : null;
}

// Module-level (not per-instance) so multiple workspace instances don't fight
// over the global sidebar signals.
if (IS_BROWSER) {
  effect(() => {
    const wsId = workspaces.currentWorkspaceId.value;
    if (!wsId) return;
    const of = getOpenedFilesFor(wsId);
    of.selected.value; // track selection so tapping a file closes the overlay
    const empty = of.opened.value.length === 0;
    if (empty) sidebarCollapsed.value = false;
    sidebarOverlayOpen.value = empty;
  });
}
