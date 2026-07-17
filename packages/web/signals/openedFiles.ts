import { createModel, effect } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { sidebarCollapsed, sidebarOverlayOpen } from "@/signals/sidebar.ts";
import { workspaces } from "@/signals/workspace.ts";
import { scopedPersistentSignal } from "@/utils/persistentSignal.ts";

export const OpenedFilesModel = createModel(() => {
  const selected = scopedPersistentSignal(
    () => `selectedFile:${workspaces.currentWorkspaceId.value}`,
    "",
  );
  const opened = scopedPersistentSignal<string[]>(
    () => `openedFiles:${workspaces.currentWorkspaceId.value}`,
    [],
  );
  const history = scopedPersistentSignal<string[]>(
    () => `fileHistory:${workspaces.currentWorkspaceId.value}`,
    [],
  );

  // Close the sidebar overlay once a file is selected (small-screen UX).
  if (IS_BROWSER) {
    effect(() => {
      selected.value;
      sidebarOverlayOpen.value = false;
      if (opened.value.length === 0) sidebarCollapsed.value = false;
    });
  }

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

  return {
    opened,
    selected,
    open,
    close,
  };
});

export const openedFiles = new OpenedFilesModel();
