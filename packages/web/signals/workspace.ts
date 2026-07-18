import type { Workspace } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import createAsyncState from "@/utils/asyncState.ts";
import { persistentSignal } from "@/utils/persistentSignal.ts";

export const WorkspacesModel = createModel(() => {
  const currentWorkspaceId = persistentSignal<string>("workspaceId", "");
  const list = signal<Workspace[]>([]);
  const [run, { loading, error }] = createAsyncState(true);

  const current = computed(() =>
    list.value.find((w) => w.id === currentWorkspaceId.value),
  );

  function select(id: string): void {
    currentWorkspaceId.value = id;
  }

  /** Fetch the user's workspaces; select the persisted id or the first one. */
  async function load(): Promise<void> {
    const result = await run(async () => {
      const res = await fetch("/api/workspaces");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as Workspace[];
    });
    if (!result) return;
    list.value = result;
    const persisted = currentWorkspaceId.value;
    const stillExists = result.some((w) => w.id === persisted);
    currentWorkspaceId.value = stillExists ? persisted : (result[0]?.id ?? "");
  }

  /** Create a workspace via POST /api/workspaces, refresh the list, and select it. */
  async function create(name: string): Promise<Workspace> {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? `Request failed (${res.status})`);
    }
    const workspace = (await res.json()) as Workspace;
    await load();
    currentWorkspaceId.value = workspace.id;
    return workspace;
  }

  if (IS_BROWSER) void load();

  return {
    currentWorkspaceId,
    list,
    current,
    loading,
    error,
    select,
    load,
    create,
  };
});

export const workspaces = new WorkspacesModel();
