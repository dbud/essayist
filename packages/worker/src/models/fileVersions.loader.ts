import { type FileMissingError, Files, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";

import type { FileVersionsData } from "./fileVersions.data.ts";

export function fileVersionsLoader(
  wsId: string,
  path: string,
): Effect.Effect<typeof FileVersionsData.Type, FileMissingError, Files> {
  return Effect.gen(function* () {
    const files = yield* Files;
    const file = yield* files.fileAt(path);
    return yield* files.versions(file.id);
  }).pipe(Effect.provideService(WorkspaceId, { wsId }));
}
