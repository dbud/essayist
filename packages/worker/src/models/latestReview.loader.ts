import {
  FileMissingError,
  Files,
  Marks,
  type ReviewRun,
  ReviewRuns,
  WorkspaceId,
} from "@essayist/core";
import { Effect } from "effect";

import type { LatestReviewData } from "./marks.data.ts";

/**
 * The review a version of a file shows: the latest at or before it, so a version saved after a
 * review shows that review. The latest version when none is given.
 */
export function latestReviewLoader(
  wsId: string,
  fileId: string,
  versionId?: string,
): Effect.Effect<typeof LatestReviewData.Type, FileMissingError, Files | Marks | ReviewRuns> {
  return Effect.gen(function* () {
    const files = yield* Files;
    const versions = yield* files.versions(fileId);
    const version =
      versionId === undefined ? versions.at(-1) : versions.find(({ id }) => id === versionId);
    if (version === undefined)
      return yield* Effect.fail(new FileMissingError({ fileId, versionId }));
    const seqOf = new Map(versions.map(({ id, seq }) => [id, seq]));
    const seq = (run: ReviewRun) => seqOf.get(run.versionId) ?? 0;
    // a running review counts, so its marks show as they are placed
    const reviews = (yield* ReviewRuns.use((store) => store.listRuns(fileId))).filter(
      (run) => run.status !== "failed" && seq(run) <= version.seq,
    );
    // the highest version first; the sort is stable and runs come newest first, so a version
    // reviewed twice shows its latest review
    const run = reviews.toSorted((a, b) => seq(b) - seq(a)).at(0);
    if (run === undefined) return null;
    // a version is deleted together with its runs, so the version of a listed run exists
    const { content } = yield* Effect.orDie(files.read(fileId, run.versionId));
    const marks = yield* Marks.use((store) => store.ofRun(run.id));
    return { runId: run.id, versionId: run.versionId, content, marks };
  }).pipe(Effect.provideService(WorkspaceId, { wsId }));
}
