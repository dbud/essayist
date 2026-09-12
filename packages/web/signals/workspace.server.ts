import { type Context, registerLoader } from "@/signals/models.server.ts";
import { type WorkspacesData, workspacesNs } from "@/signals/workspace.ts";
import { userStateStore, workspaceStore } from "@/store.ts";

export async function workspacesLoader(ctx: Context): Promise<WorkspacesData> {
  const workspaces = await workspaceStore.listWorkspacesForUser(ctx.user.id);
  const persisted = await userStateStore.getSelectedWorkspace(ctx.user.id);
  const intent = ctx.url.searchParams.get("ws");
  const selectedId =
    workspaces.find((w) => w.id === intent)?.id ??
    workspaces.find((w) => w.id === persisted)?.id ??
    workspaces[0]?.id ??
    null;
  return { workspaces, selectedId };
}

registerLoader(workspacesNs, (_key, ctx) => workspacesLoader(ctx));
