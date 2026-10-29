import { effect, type ReadonlySignal } from "@preact/signals";

import { PENDING_VERSION_ID } from "#/models/fileContent.ts";
import type { FileSelection } from "#/models/fileSelection.ts";
import { patchJson } from "#/models/utils/http.ts";

let timer: ReturnType<typeof setTimeout> | undefined;
let pendingWsId: string | null = null;
let pendingPath: { wsId: string; path: string } | null = null;
let lastWsId: string | null = null;

const DEBOUNCE_MS = 500;

function flush(keepalive: boolean): void {
  if (pendingWsId) {
    patchJson("/api/workspaces", { wsId: pendingWsId }, { keepalive }).catch(() => {});
    pendingWsId = null;
  }
  if (pendingPath) {
    patchJson("/api/workspaces/files", pendingPath, { keepalive }).catch(() => {});
    pendingPath = null;
  }
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => flush(false), DEBOUNCE_MS);
}

// The pagehide flush uses keepalive so pending writes survive page unload.
export function setupSelectionPersist(selected: ReadonlySignal<FileSelection | null>): void {
  effect(() => {
    const selection = selected.value;
    if (selection === null || selection.versionId === PENDING_VERSION_ID) return;
    if (selection.wsId !== lastWsId) {
      lastWsId = selection.wsId;
      pendingWsId = selection.wsId;
    }
    if (selection.path !== null) {
      pendingPath = { wsId: selection.wsId, path: selection.path };
    }
    schedule();
  });

  globalThis.addEventListener("pagehide", () => flush(true));
}
