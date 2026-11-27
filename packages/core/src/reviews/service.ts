/** Review runs as an Effect service, scoped to the workspace through the file of each run. */

import { Context, type Effect, type Option, Schema } from "effect";

import type { FileMissingError } from "#/files/d1/types.ts";
import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import type { ReviewRun } from "./types.ts";

/** A run was looked up and does not exist (never created, deleted, or in another workspace). */
export class ReviewRunMissingError extends Schema.TaggedError<ReviewRunMissingError>()(
  "ReviewRunMissingError",
  { runId: Schema.String },
) {
  override get message() {
    return `No run ${this.runId}`;
  }
}

/** A run is still running: a second run on its file, or deleting it, is refused. */
export class ReviewRunActiveError extends Schema.TaggedError<ReviewRunActiveError>()(
  "ReviewRunActiveError",
  { runId: Schema.String },
) {
  override get message() {
    return `Run ${this.runId} is still running`;
  }
}

export interface Interface {
  /** Start a run on a version; refused with ReviewRunActiveError while the file has one running. */
  createRun(input: {
    fileId: string;
    versionId: string;
    reviewPassId: string;
  }): Effect.Effect<ReviewRun, FileMissingError | ReviewRunActiveError, WorkspaceId>;
  getRun(runId: string): Effect.Effect<ReviewRun, ReviewRunMissingError, WorkspaceId>;
  /** The runs of the workspace, or of a single file, newest first. */
  listRuns(fileId?: string): Effect.Effect<ReadonlyArray<ReviewRun>, never, WorkspaceId>;
  completeRun(
    runId: string,
    summary: string,
  ): Effect.Effect<ReviewRun, ReviewRunMissingError, WorkspaceId>;
  failRun(
    runId: string,
    error: string,
  ): Effect.Effect<ReviewRun, ReviewRunMissingError, WorkspaceId>;
  /**
   * Take the lease on a running run, so a single driver works on it at a time. The lease is free
   * when nobody holds it, the owner is the caller, or its heartbeat is older than `staleMs`.
   * Option.none when the run is missing, settled, or leased to a live driver.
   */
  claimRun(
    runId: string,
    lease: { owner: string; staleMs: number },
  ): Effect.Effect<Option.Option<ReviewRun>, never, WorkspaceId>;
  /** Renew the lease while the owner still holds it; false when it is lost. */
  heartbeatRun(runId: string, owner: string): Effect.Effect<boolean, never, WorkspaceId>;
  /** Delete a run with its trace and marks. */
  deleteRun(
    runId: string,
  ): Effect.Effect<void, ReviewRunMissingError | ReviewRunActiveError, WorkspaceId>;
  /**
   * Delete the runs of a file, or only those on a single version, with their traces and marks.
   * Refused, deleting nothing, while one of them is running. Returns how many were deleted.
   */
  deleteRuns(
    fileId: string,
    versionId?: string,
  ): Effect.Effect<number, ReviewRunActiveError, WorkspaceId>;
}

export class ReviewRuns extends Context.Service<ReviewRuns, Interface>()(
  "@essayist/core/reviews/ReviewRuns",
) {}
