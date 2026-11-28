import { UserState, Workspaces } from "@essayist/core";
import { Effect, Option } from "effect";

import { workspaceIdOf } from "./workspaceParam.ts";
import type { WorkspacesData } from "./workspaces.data.ts";

/** The workspaces of a user, with the one the URL names selected, else the one opened last. */
export function workspacesLoader(
  userId: string,
  wsParam?: string,
): Effect.Effect<typeof WorkspacesData.Type, never, Workspaces | UserState> {
  return Effect.gen(function* () {
    const workspaces = yield* Workspaces.use((store) => store.listWorkspacesForUser(userId));
    const ids = workspaces.map(({ workspace }) => workspace.id);
    const persisted = yield* UserState.use((store) => store.getSelectedWorkspace(userId));
    const selectedId =
      workspaceIdOf(wsParam, ids) ??
      ids.find((id) => Option.contains(persisted, id)) ??
      ids[0] ??
      null;
    return { workspaces, selectedId };
  });
}
