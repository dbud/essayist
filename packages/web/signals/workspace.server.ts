import { UserState, Workspaces } from "@essayist/core";
import { type Context, registerLoader } from "#/signals/models.server.ts";
import { type WorkspacesData, workspacesNs } from "#/signals/workspace.ts";
import { runtime } from "#/store.ts";

export async function workspacesLoader(ctx: Context): Promise<WorkspacesData> {
  const workspaces = await runtime.runPromise(
    Workspaces.use((store) => store.listWorkspacesForUser(ctx.user.id)),
  );
  const persisted = await runtime.runPromise(
    UserState.use((store) => store.getSelectedWorkspace(ctx.user.id)),
  );
  const intent = ctx.url.searchParams.get("ws");
  const selectedId =
    workspaces.find((w) => w.id === intent)?.id ??
    workspaces.find((w) => w.id === persisted)?.id ??
    workspaces[0]?.id ??
    null;
  return { workspaces, selectedId };
}

registerLoader(workspacesNs, (_key, ctx) => workspacesLoader(ctx));
