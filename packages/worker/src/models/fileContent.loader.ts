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
    const draft = version.isHead
      ? yield* Effect.provideService(
          Files.use((store) => store.readDraft(path)),
          WorkspaceId,
          { wsId },
        )
      : null;
    return { version, draft };
  });
}
