import { type FileMissingError, Files, Marks, ReviewRuns, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";

import type { LatestReviewData } from "./marks.data.ts";

export function latestReviewLoader(
  wsId: string,
  path: string,
): Effect.Effect<typeof LatestReviewData.Type, FileMissingError, Files | Marks | ReviewRuns> {
  return Effect.gen(function* () {
    const files = yield* Files;
    const file = yield* files.fileAt(path);
    const runs = yield* ReviewRuns.use((store) => store.listRuns(file.id));
    const run = runs.find((candidate) => candidate.status === "completed");
    if (run === undefined) return null;
    // a version is deleted together with its runs, so the version of a listed run exists
    const { content } = yield* Effect.orDie(files.read(file.id, run.versionId));
    const marks = yield* Marks.use((store) => store.ofRun(run.id));
    return { runId: run.id, versionId: run.versionId, content, marks };
  }).pipe(Effect.provideService(WorkspaceId, { wsId }));
}
