/**
 * Review runs as an Effect service: creation, reads, listing, and the lease ops. The D1 layer is
 * the only transport.
 */

import { Context, type Effect, type Option, Schema } from "effect";

import type { ClaimOptions } from "#/persistence/mod.ts";
import type { PersistenceError } from "#/persistence/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import type { ReviewRun } from "./types.ts";

/** A run was looked up and does not exist (never created, or swept). */
export class ReviewRunMissingError extends Schema.TaggedError<ReviewRunMissingError>()(
  "ReviewRunMissingError",
  { id: Schema.String },
) {
  override get message() {
    return `No run ${this.id}`;
  }
}

export interface Interface {
  /** Create a run in the "running" state. */
  createRun(input: {
    path: string;
    versionId: string;
    reviewPassId: string;
    startedAt?: number;
  }): Effect.Effect<ReviewRun, PersistenceError, WorkspaceId>;
  /** Get a run. Fails with ReviewRunMissingError when absent. */
  getRun(
    id: string,
  ): Effect.Effect<ReviewRun, PersistenceError | ReviewRunMissingError, WorkspaceId>;
  /** List runs for the workspace, newest first. Optionally filtered by file. */
  listRuns(path?: string): Effect.Effect<ReadonlyArray<ReviewRun>, PersistenceError, WorkspaceId>;
  /** Complete a run with its final summary. Fails with ReviewRunMissingError when absent. */
  completeRun(
    id: string,
    summary: string,
  ): Effect.Effect<ReviewRun, PersistenceError | ReviewRunMissingError, WorkspaceId>;
  /** Fail a run with its error. Fails with ReviewRunMissingError when absent. */
  failRun(
    id: string,
    error: string,
  ): Effect.Effect<ReviewRun, PersistenceError | ReviewRunMissingError, WorkspaceId>;
  /**
   * Take the lease on a run, so only one owner works on it at a time. Option.none when the run is
   * gone, another owner holds a live lease, or a concurrent claim won the race. Claiming as the
   * current owner renews.
   */
  claimRun(
    id: string,
    options: ClaimOptions,
  ): Effect.Effect<Option.Option<ReviewRun>, PersistenceError, WorkspaceId>;
  /**
   * Renew the lease on a run, only while it is leased to the given owner. Unlike claim, this never
   * takes a lease. False when the run is gone, another owner holds the lease, or a concurrent write
   * won the race.
   */
  heartbeatRun(id: string, owner: string): Effect.Effect<boolean, PersistenceError, WorkspaceId>;
}

/** Review run storage as an Effect service. */
export class ReviewRuns extends Context.Service<ReviewRuns, Interface>()(
  "@essayist/core/reviews/ReviewRuns",
) {}
