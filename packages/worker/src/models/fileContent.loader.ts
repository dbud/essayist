import {
  type FileMissingError,
  Files,
  type PersistenceError,
  WorkspaceId,
} from "@essayist/core";
import { Effect } from "effect";
import type { FileContentData } from "#/models/fileContent.data.ts";

export function fileContentLoader(
  wsId: string,
  path: string,
): Effect.Effect<FileContentData, PersistenceError | FileMissingError, Files> {
  return Effect.gen(function* () {
    const version = yield* Effect.provideService(
      Files.use((store) => store.read(path)),
      WorkspaceId,
      { wsId },
    );
    const draft = yield* Effect.provideService(
      Files.use((store) => store.readDraft(path)),
      WorkspaceId,
      { wsId },
    );
    return { version, draft };
  });
}
