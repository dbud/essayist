import {
  Files,
  type PersistenceError,
  UserState,
  WorkspaceId,
} from "@essayist/core";
import { Effect } from "effect";
import type { FileTreeData } from "#/models/fileTree.data.ts";

export function fileTreeLoader(
  userId: string,
  wsId: string,
  fileIntent: string | undefined,
  versionIntent?: string,
): Effect.Effect<FileTreeData, PersistenceError, Files | UserState> {
  return Effect.gen(function* () {
    const files = yield* Effect.provideService(
      Files.use((store) => store.list()),
      WorkspaceId,
      { wsId },
    );
    const persisted = yield* UserState.use((store) =>
      store.getSelectedFile(userId, wsId),
    );
    const known = (p: string | null | undefined): p is string =>
      !!p && files.some((file) => file.path === p);
    const selectedPath = known(fileIntent)
      ? fileIntent
      : known(persisted)
        ? persisted
        : (files[0]?.path ?? null);
    let selectedVersionId = null;
    if (selectedPath) {
      const fallback =
        files.find((file) => file.path === selectedPath)?.latestVersionId ??
        null;
      if (versionIntent === undefined) {
        selectedVersionId = fallback;
      } else {
        const versions = yield* Effect.provideService(
          Files.use((store) => store.getVersions(selectedPath)),
          WorkspaceId,
          { wsId },
        ).pipe(Effect.catchTag("FileMissingError", (err) => Effect.die(err)));
        selectedVersionId = versions.some(
          (version) => version.version_id === versionIntent,
        )
          ? versionIntent
          : fallback;
      }
    }
    return { files, selectedPath, selectedVersionId };
  });
}
