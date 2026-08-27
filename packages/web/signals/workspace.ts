import type { Workspace } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { get, seed } from "@/signals/models.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { ensureOk } from "@/utils/ensureOk.ts";
import { persistentSignal } from "@/utils/persistentSignal.ts";

interface WorkspacesSeed {
  list: Workspace[];
  currentId: string;
}

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
      await ensureOk(res);
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
    await ensureOk(res);
    const workspace = (await res.json()) as Workspace;
    await load();
    currentWorkspaceId.value = workspace.id;
    return workspace;
  }

  // Prefer a server-provided seed (list + current id) over a REST fetch.
  const seeded = seed<WorkspacesSeed>("workspaces", "singleton");
  if (seeded) {
    list.value = seeded.list;
    currentWorkspaceId.value = seeded.currentId;
    loading.value = false;
  }
  if (IS_BROWSER && !seeded) void load();

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

export type WorkspacesModelInstance = InstanceType<typeof WorkspacesModel>;

/**
 * Request-scoped on the server (the active request's WorkspacesModel, via the
 * model store) and module-scoped on the client. The Proxy keeps the existing
 * `workspaces.foo` call sites unchanged while routing property access to the
 * per-environment instance.
 */
export const workspaces = new Proxy({} as WorkspacesModelInstance, {
  get(_t, prop) {
    const inst = get<WorkspacesModelInstance>(
      "workspaces",
      "singleton",
      () => new WorkspacesModel(),
    );
    return Reflect.get(inst, prop);
  },
}) as WorkspacesModelInstance;
