import { type PersistenceError, UserState, Workspaces } from "@essayist/core";
import { Effect } from "effect";
import type { WorkspacesData } from "#/models/workspaces.data.ts";

export function workspacesLoader(
  userId: string,
  wsIntent: string | undefined,
): Effect.Effect<WorkspacesData, PersistenceError, Workspaces | UserState> {
  return Effect.gen(function* () {
    const workspaces = yield* Workspaces.use((store) =>
      store.listWorkspacesForUser(userId),
    );
    const persistedWs = yield* UserState.use((store) =>
      store.getSelectedWorkspace(userId),
    );
    const selectedId =
      workspaces.find((workspace) => workspace.id === wsIntent)?.id ??
      workspaces.find((workspace) => workspace.id === persistedWs)?.id ??
      workspaces[0]?.id ??
      null;
    return { workspaces, selectedId };
  });
}
