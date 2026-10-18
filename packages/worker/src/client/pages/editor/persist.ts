import { effect } from "@preact/signals";
import { patchJson } from "#/models/http.ts";
import type { EditorModels } from "#/pages/editor/models.ts";

let timer: ReturnType<typeof setTimeout> | undefined;
let pendingWsId: string | null = null;
let pendingPath: { wsId: string; path: string } | null = null;

const DEBOUNCE_MS = 500;

function flush(keepalive: boolean): void {
  if (pendingWsId) {
    patchJson("/api/workspaces", { wsId: pendingWsId }, { keepalive }).catch(
      () => {},
    );
    pendingWsId = null;
  }
  if (pendingPath) {
    patchJson("/api/workspaces/files", pendingPath, { keepalive }).catch(
      () => {},
    );
    pendingPath = null;
  }
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => flush(false), DEBOUNCE_MS);
}

// The pagehide flush uses keepalive so pending writes survive page
// unload.
export function setupSelectionPersist({
  workspaces,
  fileTrees,
}: EditorModels): void {
  effect(() => {
    const wsId = workspaces.selectedId.value;
    if (!wsId) return;
    pendingWsId = wsId;
    schedule();
  });

  effect(() => {
    const wsId = workspaces.selectedId.value;
    if (!wsId) return;
    const path = fileTrees.current.value?.selectedPath.value;
    if (!path) return;
    pendingPath = { wsId, path };
    schedule();
  });

  globalThis.addEventListener("pagehide", () => flush(true));
}
