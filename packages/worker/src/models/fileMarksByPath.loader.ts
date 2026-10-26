import {
  type FileMissingError,
  Files,
  type PersistenceError,
  WorkspaceId,
} from "@essayist/core";
import { Effect } from "effect";
import type { FileMarksByPathData } from "./fileMarksByPath.data.ts";

export function fileMarksByPathLoader(
  wsId: string | null,
  path: string | null,
): Effect.Effect<
  FileMarksByPathData,
  PersistenceError | FileMissingError,
  Files
> {
  return Effect.gen(function* () {
    if (wsId === null || path === null) {
      return { wsId: null, path: null, versionId: null, marks: null };
    }
    const snapshot = yield* Effect.provideService(
      Files.use((store) => store.read(path)),
      WorkspaceId,
      { wsId },
    );
    const marks = yield* Effect.provideService(
      Files.use((store) => store.getMarks(path, snapshot.version_id)),
      WorkspaceId,
      { wsId },
    );
    return { wsId, path, versionId: snapshot.version_id, marks };
  });
}
