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

  // Auto-manage the sidebar based on whether any files are open.
  if (IS_BROWSER) {
    effect(() => {
      selected.value;
      const empty = opened.value.length === 0;
      // Desktop: auto-expand the sidebar when there are no files to show.
      if (empty) sidebarCollapsed.value = false;
      // Mobile: keep the file browser overlay open when there are no opened
      // files so the user can pick one; close it once a file is selected so
      // the viewer is visible.
      sidebarOverlayOpen.value = empty;
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
