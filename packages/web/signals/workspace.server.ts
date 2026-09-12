import type { Workspace } from "@essayist/core";
import { type Context, registerLoader } from "@/signals/models.server.ts";
import { workspacesNs } from "@/signals/workspace.ts";
import { workspaceStore } from "@/store.ts";

export function workspacesLoader({ user }: Context): Promise<Workspace[]> {
  return workspaceStore.listWorkspacesForUser(user.id);
}

registerLoader(workspacesNs, (_key, ctx) => workspacesLoader(ctx));
