import type { Workspace } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { get, modelData, namespace } from "@/signals/models.ts";
import { ensureOk } from "@/utils/ensureOk.ts";

export interface WorkspacesData {
  workspaces: Workspace[];
  selectedId: string | null;
}

export const workspacesNs = namespace<WorkspacesData>("workspaces");

export const WorkspacesModel = createModel(() => {
  const list = signal<Workspace[]>([]);
  const selectedId = signal<string | null>(null);

  const current = computed(() =>
    list.value.find((w) => w.id === selectedId.value),
  );

  function select(id: string): void {
    selectedId.value = id;
  }

  const { loading, error, refresh } = modelData(
    workspacesNs,
    "singleton",
    (data) => {
      list.value = data.workspaces;
      selectedId.value = data.selectedId;
    },
    async () => {
      const res = await fetch("/api/workspaces");
      await ensureOk(res);
      return (await res.json()) as WorkspacesData;
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
    select(workspace.id);
    return workspace;
  }

  return {
    list,
    selectedId,
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
