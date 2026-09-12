import { effect } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { getWorkspaces } from "@/signals/workspace.ts";

// Persists the selected workspace and file to their PATCH endpoints. User
// changes are debounced; pending writes flush with keepalive at pagehide.

const DEBOUNCE_MS = 500;

let timer: ReturnType<typeof setTimeout> | undefined;
let pendingWorkspaceId: string | null = null;
let pendingFile: { workspaceId: string; path: string } | null = null;

function flush(keepalive: boolean): void {
  if (pendingWorkspaceId !== null) {
    fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedId: pendingWorkspaceId }),
      keepalive,
    }).catch(() => {});
  }
  if (pendingFile) {
    fetch(
      `/api/workspaces/${encodeURIComponent(pendingFile.workspaceId)}/files`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedPath: pendingFile.path }),
        keepalive,
      },
    ).catch(() => {});
  }
  pendingWorkspaceId = null;
  pendingFile = null;
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => flush(false), DEBOUNCE_MS);
}

if (IS_BROWSER) {
  effect(() => {
    const wsId = getWorkspaces().selectedId.value;
    if (!wsId) return;
    pendingWorkspaceId = wsId;
    schedule();
  });

  effect(() => {
    const wsId = getWorkspaces().selectedId.value;
    if (!wsId) return;
    const path = getFileTreeFor(wsId).selectedPath.value;
    if (!path) return;
    pendingFile = { workspaceId: wsId, path };
    schedule();
  });

  globalThis.addEventListener("pagehide", () => flush(true));
}
