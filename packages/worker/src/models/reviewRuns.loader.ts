import { type FileMissingError, Files, ReviewRuns, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";

import type { ReviewRunsData } from "./reviewRuns.data.ts";

/** The runs of a file, or of the whole workspace without a path, newest first. */
export function reviewRunsLoader(
  wsId: string,
  path?: string,
): Effect.Effect<typeof ReviewRunsData.Type, FileMissingError, Files | ReviewRuns> {
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    if (path === undefined) return yield* runs.listRuns();
    const file = yield* Files.use((files) => files.fileAt(path));
    return yield* runs.listRuns(file.id);
  }).pipe(Effect.provideService(WorkspaceId, { wsId }));
}
