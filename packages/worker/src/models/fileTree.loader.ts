import { Files, UserState, WorkspaceId } from "@essayist/core";
import { Effect, Option } from "effect";

import type { FileTreeData } from "#/models/fileTree.data.ts";

/**
 * The files of a workspace and the one to show: the file asked for, else the last selected, else
 * the first; with the version asked for when the file has it, else the latest.
 */
export function fileTreeLoader(
  userId: string,
  wsId: string,
  pathIntent: string | undefined,
  versionIntent?: string,
): Effect.Effect<typeof FileTreeData.Type, never, Files | UserState> {
  return Effect.gen(function* () {
    const files = yield* Files.use((store) => store.list());
    const persisted = yield* UserState.use((store) => store.getSelectedFile(userId, wsId));
    const at = (path: string | undefined) => files.find((entry) => entry.file.path === path);
    const selected = at(pathIntent) ?? at(Option.getOrUndefined(persisted)) ?? files[0];
    if (selected === undefined) return { files, selectedPath: null, selectedVersionId: null };

    let selectedVersionId = selected.latest.id;
    if (versionIntent !== undefined && versionIntent !== selected.latest.id) {
      // the file was just listed, so it exists
      const versions = yield* Effect.orDie(Files.use((store) => store.versions(selected.file.id)));
      if (versions.some((version) => version.id === versionIntent)) {
        selectedVersionId = versionIntent;
      }
    }
    return { files, selectedPath: selected.file.path, selectedVersionId };
  }).pipe(Effect.provideService(WorkspaceId, { wsId }));
}
