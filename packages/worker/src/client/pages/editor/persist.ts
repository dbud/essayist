import { effect } from "@preact/signals";
import { patchJson } from "#/models/http.ts";
import type { Workspaces } from "#/models/workspaces.ts";

let timer: ReturnType<typeof setTimeout> | undefined;
let pendingWsId: string | null = null;

const DEBOUNCE_MS = 500;

function flush(keepalive: boolean): void {
  if (pendingWsId !== null) {
    patchJson(
      "/api/workspaces",
      { selectedId: pendingWsId },
      { keepalive },
    ).catch(() => {});
  }
  pendingWsId = null;
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => flush(false), DEBOUNCE_MS);
}

export function setupWorkspacePersist(workspaces: Workspaces): void {
  effect(() => {
    const wsId = workspaces.selectedId.value;
    if (!wsId) return;
    pendingWsId = wsId;
    schedule();
  });

  globalThis.addEventListener("pagehide", () => flush(true));
}
