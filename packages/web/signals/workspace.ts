import type { Workspace } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { get, modelData, namespace } from "@/signals/models.ts";
import { ensureOk } from "@/utils/ensureOk.ts";
import { persistentSignal } from "@/utils/persistentSignal.ts";

export const workspacesNs = namespace<Workspace[]>("workspaces");

export const WorkspacesModel = createModel(() => {
  const currentWorkspaceId = persistentSignal<string>("workspaceId", "");
  const list = signal<Workspace[]>([]);

  const current = computed(() =>
    list.value.find((w) => w.id === currentWorkspaceId.value),
  );

  function select(id: string): void {
    currentWorkspaceId.value = id;
  }

  const { loading, error, refresh } = modelData(
    workspacesNs,
    "singleton",
    (data) => {
      list.value = data;
      const persisted = currentWorkspaceId.value;
      const stillExists = data.some((w) => w.id === persisted);
      currentWorkspaceId.value = stillExists ? persisted : (data[0]?.id ?? "");
    },
    async () => {
      const res = await fetch("/api/workspaces");
      await ensureOk(res);
      return (await res.json()) as Workspace[];
    },
  );

  /** Create a workspace via POST /api/workspaces, refresh the list, and select it. */
  async function create(name: string): Promise<Workspace> {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await ensureOk(res);
    const workspace = (await res.json()) as Workspace;
    await refresh();
    currentWorkspaceId.value = workspace.id;
    return workspace;
  }

  return {
    currentWorkspaceId,
    list,
    current,
    loading,
    error,
    select,
    create,
    refresh,
  };
});

export type Workspaces = InstanceType<typeof WorkspacesModel>;

export function getWorkspaces(): Workspaces {
  return get(workspacesNs, "singleton", () => new WorkspacesModel());
}
