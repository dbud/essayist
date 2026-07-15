import type { Workspace } from "@essayist/core";
import { signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { persistentSignal } from "@/utils/persistentSignal.ts";

/**
 * The currently selected workspace id. Persisted to localStorage so a refresh
 * keeps the user in the same workspace; reset to the first available workspace
 * if the persisted id no longer exists (e.g. after a restart with random ids).
 *
 * Bootstrapped from `GET /api/workspaces` on the client. Stays empty until that
 * fetch resolves; data models gate their loads on this becoming non-empty.
 */
export const currentWorkspaceId = persistentSignal<string>("workspaceId", "");

export const workspaces = signal<Workspace[]>([]);

export async function loadWorkspaces(): Promise<void> {
  const res = await fetch("/api/workspaces");
  if (!res.ok) return;
  const list = (await res.json()) as Workspace[];
  workspaces.value = list;

  const persisted = currentWorkspaceId.value;
  const stillExists = list.some((w) => w.id === persisted);
  currentWorkspaceId.value = stillExists ? persisted : (list[0]?.id ?? "");
}

if (IS_BROWSER) {
  void loadWorkspaces();
}
