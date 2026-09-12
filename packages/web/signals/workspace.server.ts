import type { User, Workspace } from "@essayist/core";
import { registerLoader } from "@/signals/models.server.ts";
import { workspacesNs } from "@/signals/workspace.ts";
import { workspaceStore } from "@/store.ts";

export function workspacesLoader(user: User): Promise<Workspace[]> {
  return workspaceStore.listWorkspacesForUser(user.id);
}

registerLoader(workspacesNs, (_key, user) => workspacesLoader(user));
