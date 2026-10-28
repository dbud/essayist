import { computed, createModel, signal } from "@preact/signals";

import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson } from "#/models/utils/http.ts";

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
      const data = await getJson<WorkspacesData>("/api/workspaces");
      list.value = data.workspaces;
      selectedId.value = data.selectedId;
    });
  }

  return { list, selectedId, current, select, refresh, loading, error };
});

export type Workspaces = InstanceType<typeof WorkspacesModel>;
