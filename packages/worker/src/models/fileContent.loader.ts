import {
  type FileMissingError,
  Files,
  type PersistenceError,
  WorkspaceId,
} from "@essayist/core";
import { Effect } from "effect";
import type { FileContentData } from "./fileContent.data.ts";

export function fileContentLoader(
  wsId: string,
  path: string,
  versionId?: string,
): Effect.Effect<FileContentData, PersistenceError | FileMissingError, Files> {
  return Effect.gen(function* () {
    const version = yield* Effect.provideService(
      Files.use((store) => store.read(path, versionId)),
      WorkspaceId,
      { wsId },
    );
    const versions = yield* Effect.provideService(
      Files.use((store) => store.getVersions(path)),
      WorkspaceId,
      { wsId },
    );
    // The versions list is append-ordered, so the newest is last.
    const latestVersionId = versions[versions.length - 1]?.version_id;
    const writable = versionId === undefined || versionId === latestVersionId;
    const draft = writable
      ? yield* Effect.provideService(
          Files.use((store) => store.readDraft(path)),
          WorkspaceId,
          { wsId },
        )
      : null;
    return { version, draft, writable };
  });
}
