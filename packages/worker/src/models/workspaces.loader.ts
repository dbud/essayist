import { type PersistenceError, UserState, Workspaces } from "@essayist/core";
import { Effect } from "effect";

import type { WorkspacesData } from "./workspaces.data.ts";

export function workspacesLoader(
  userId: string,
  wsIntent: string | undefined,
): Effect.Effect<typeof WorkspacesData.Type, PersistenceError, Workspaces | UserState> {
  return Effect.gen(function* () {
    const workspaces = yield* Workspaces.use((store) => store.listWorkspacesForUser(userId));
    const persistedWs = yield* UserState.use((store) => store.getSelectedWorkspace(userId));
    const selectedId =
      workspaces.find(({ workspace }) => workspace.id === wsIntent)?.workspace.id ??
      workspaces.find(({ workspace }) => workspace.id === persistedWs)?.workspace.id ??
      workspaces[0]?.workspace.id ??
      null;
    return { workspaces, selectedId };
  });
}
