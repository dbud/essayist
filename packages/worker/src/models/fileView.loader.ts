import {
  type FileMissingError,
  Files,
  type PersistenceError,
  WorkspaceId,
} from "@essayist/core";
import { Effect } from "effect";
import { fileContentLoader } from "./fileContent.loader.ts";
import { fileVersionsLoader } from "./fileVersions.loader.ts";
import type { FileViewData } from "./fileView.data.ts";

export function fileViewLoader(
  wsId: string,
  path: string,
): Effect.Effect<FileViewData, PersistenceError | FileMissingError, Files> {
  return Effect.gen(function* () {
    const content = yield* fileContentLoader(wsId, path);
    const versions = yield* fileVersionsLoader(wsId, path);
    const marks = yield* Effect.provideService(
      Files.use((store) => store.getMarks(path, content.version.version_id)),
      WorkspaceId,
      { wsId },
    );
    return { content, versions, marks };
  });
}
