import { effect } from "@preact/signals";
import { patchJson } from "#/models/http.ts";
import type { EditorModels } from "#/pages/editor/models.ts";

let timer: ReturnType<typeof setTimeout> | undefined;
let pendingWsId: string | null = null;
let pendingFile: { wsId: string; path: string } | null = null;

const DEBOUNCE_MS = 500;

function flush(keepalive: boolean): void {
  if (pendingWsId !== null) {
    patchJson("/api/workspaces", { wsId: pendingWsId }, { keepalive }).catch(
      () => {},
    );
  }
  if (pendingFile) {
    patchJson(
      "/api/workspaces/files",
      { wsId: pendingFile.wsId, path: pendingFile.path },
      { keepalive },
    ).catch(() => {});
  }
  pendingWsId = null;
  pendingFile = null;
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => flush(false), DEBOUNCE_MS);
}

// The pagehide flush uses keepalive so pending writes survive page unload.
export function setupSelectionPersist({
  workspaces,
  fileTree,
}: EditorModels): void {
  effect(() => {
    const wsId = workspaces.selectedId.value;
    if (!wsId) return;
    pendingWsId = wsId;
    schedule();
  });

  effect(() => {
    if (!fileTree) return;
    const wsId = workspaces.selectedId.value;
    if (wsId === null || fileTree.wsId !== wsId) return;
    const path = fileTree.tree.selectedPath.value;
    if (!path) return;
    pendingFile = { wsId, path };
    schedule();
  });

  globalThis.addEventListener("pagehide", () => flush(true));
}
