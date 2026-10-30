import type { Workspace } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";

import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson, postJson } from "#/models/utils/http.ts";

import type { WorkspacesData } from "./workspaces.data";

export const WorkspacesModel = createModel((data: WorkspacesData) => {
  const list = signal(data.workspaces);
  const selectedId = signal(data.selectedId);

  const current = computed(() => list.value.find((workspace) => workspace.id === selectedId.value));

  function select(id: string): void {
    selectedId.value = id;
  }

  const [runRefresh, { loading, error }] = createAsyncState();

  async function refresh(): Promise<void> {
    await runRefresh(async () => {
      const fresh = await getJson<WorkspacesData>("/api/workspaces");
      list.value = fresh.workspaces;
      selectedId.value = fresh.selectedId;
    });
  }

  async function create(name: string): Promise<void> {
    const workspace = await postJson<Workspace>("/api/workspaces", { name });
    list.value = [...list.value, workspace];
    select(workspace.id);
  }

  return { list, selectedId, current, select, refresh, create, loading, error };
});

export type Workspaces = InstanceType<typeof WorkspacesModel>;
