/**
 * The review pass driver as an Effect program: the run lifecycle (claim,
 * heartbeat, complete, fail) goes through the ReviewRuns service, and the
 * flow itself stays a promise engine until its own rewrite, bridged at the
 * boundary.
 *
 * Heartbeats run interval-only: one loop fiber sleeps the interval between
 * beats, so beats never overlap and the staleness window (15 minutes vs a
 * 60-second interval) keeps a live run claimed without event pacing.
 */

import { type Context, Effect, Fiber, Result, Schema } from "effect";
import type { Agent } from "@/agent.ts";
import type { ResolvedReviewPass } from "@/config/types.ts";
import { FlowRunner } from "@/flow/runner.ts";
import { view } from "@/flow/view.ts";
import { logger } from "@/logger.ts";
import {
  type ConcurrentModificationError,
  PersistenceError,
} from "@/persistence/mod.ts";
import { buildReviewGraph } from "@/reviews/adapter.ts";
import { createReviewRunners, type ReviewTypes } from "@/reviews/graph.ts";
import type { ReviewProgress } from "@/reviews/progress.ts";
import { ReviewProgressTracker } from "@/reviews/progress.ts";
import { ReviewRuns } from "@/reviews/service.ts";
import { foldCompleted } from "@/reviews/trace/mod.ts";
import type { TraceEvent, TraceStore } from "@/reviews/trace/types.ts";
import type { ReviewRun } from "@/reviews/types.ts";
import { PinnedVFS } from "@/vfs/pin.ts";
import type { VFS } from "@/vfs/types.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";

/** Options for {@linkcode runReviewPass}. */
export interface RunReviewPassOptions {
  agent: Agent;
  vfs: VFS;
  traceStore: TraceStore;
  pass: ResolvedReviewPass;
  wsId: string;
  path: string;
  /** Receives text-free progress snapshots as the run advances. */
  onProgress?: (progress: ReviewProgress) => void;
}

// Heartbeats go out every interval. The interval must stay far under the
// staleness window, or a live run can be stolen.
const HEARTBEAT_MS = 60_000;
const HEARTBEAT_STALE_MS = 15 * 60_000;

/** The file the pass targets has no versions. */
export class ReviewFileMissingError extends Schema.TaggedError<ReviewFileMissingError>()(
  "ReviewFileMissingError",
  { path: Schema.String },
) {
  override get message() {
    return `File not found: ${this.path}`;
  }
}

/** Another driver holds a live lease on the run. */
export class ReviewLeaseTakenError extends Schema.TaggedError<ReviewLeaseTakenError>()(
  "ReviewLeaseTakenError",
  { runId: Schema.String },
) {
  override get message() {
    return `Run ${this.runId} is claimed by another driver`;
  }
}

/** The run given to resume does not exist or never started on a version. */
export class ReviewRunMissingError extends Schema.TaggedError<ReviewRunMissingError>()(
  "ReviewRunMissingError",
  { runId: Schema.String },
) {
  override get message() {
    return `Cannot resume: no run ${this.runId}`;
  }
}

export type RunnerError =
  | ReviewFileMissingError
  | ReviewLeaseTakenError
  | ReviewRunMissingError
  | PersistenceError
  | ConcurrentModificationError;

/** Run a review pass over a file version. */
export function runReviewPass(
  options: RunReviewPassOptions,
): Effect.Effect<ReviewRun, RunnerError, ReviewRuns | WorkspaceId> {
  const { vfs, path } = options;
  return Effect.gen(function* () {
    const history = yield* Effect.tryPromise({
      try: () => vfs.getHistory(path),
      catch: (cause) => new PersistenceError({ cause }),
    });
    const versionId = history.at(-1)?.version_id;
    if (!versionId) {
      return yield* Effect.fail(new ReviewFileMissingError({ path }));
    }
    return yield* start(options, versionId);
  });
}

/** Continue a run that did not finish, over the version it started on. */
export function resumeReviewPass(
  options: RunReviewPassOptions,
  runId: string,
): Effect.Effect<ReviewRun, RunnerError, ReviewRuns | WorkspaceId> {
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    const run = yield* runs.getRun(runId);
    if (!run?.versionId) {
      return yield* Effect.fail(new ReviewRunMissingError({ runId }));
    }
    return yield* resume(options, run, run.versionId);
  });
}

/** Pick up a run's trace where the previous attempt left off. */
function resume(
  options: RunReviewPassOptions,
  run: ReviewRun,
  versionId: string,
): Effect.Effect<ReviewRun, RunnerError, ReviewRuns | WorkspaceId> {
  return Effect.gen(function* () {
    const priorTrace = yield* Effect.tryPromise({
      try: () =>
        options.traceStore.get({
          wsId: options.wsId,
          runId: run.id,
        }),
      catch: (cause) => new PersistenceError({ cause }),
    });
    const priorLastSeq = priorTrace?.at(-1)?.seq;
    const seq = priorLastSeq === undefined ? 0 : priorLastSeq + 1;
    return yield* execute(options, run, versionId, seq, priorTrace);
  });
}

function start(
  options: RunReviewPassOptions,
  versionId: string,
): Effect.Effect<ReviewRun, RunnerError, ReviewRuns | WorkspaceId> {
  const { pass, path } = options;
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    const run = yield* runs.createRun({
      path,
      reviewPassId: pass.pass.id,
      versionId,
    });
    return yield* execute(options, run, versionId, 0, undefined);
  });
}

/** Claim the lease on the run for a new owner. Fails when another driver
 * holds a live lease. */
function claim(
  runs: Context.Service.Shape<typeof ReviewRuns>,
  runId: string,
): Effect.Effect<
  string,
  ReviewLeaseTakenError | PersistenceError,
  WorkspaceId
> {
  return Effect.gen(function* () {
    const owner = crypto.randomUUID();
    const claimed = yield* runs.claimRun(runId, {
      owner,
      heartbeatAtLeast: Date.now() - HEARTBEAT_STALE_MS,
    });
    if (!claimed) {
      return yield* Effect.fail(new ReviewLeaseTakenError({ runId }));
    }
    return owner;
  });
}

function heartbeatLoop(
  runs: Context.Service.Shape<typeof ReviewRuns>,
  wsId: string,
  runId: string,
  owner: string,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    let warnedLeaseLost = false;
    while (true) {
      // One beat per iteration, in flight only: the write is uninterruptible
      // so the unwind below never races it.
      const held = yield* Effect.result(
        Effect.uninterruptible(
          Effect.provideService(runs.heartbeatRun(runId, owner), WorkspaceId, {
            wsId,
          }),
        ),
      );
      if (Result.isFailure(held)) {
        logger.error({ err: held.failure }, "review run heartbeat failed");
      } else if (!held.success && !warnedLeaseLost) {
        warnedLeaseLost = true;
        logger.warn({ runId }, "review run lease lost");
      }
      yield* Effect.sleep(HEARTBEAT_MS);
    }
  });
}

function execute(
  options: RunReviewPassOptions,
  run: ReviewRun,
  versionId: string,
  seq: number,
  priorTrace: TraceEvent[] | undefined,
): Effect.Effect<ReviewRun, RunnerError, ReviewRuns | WorkspaceId> {
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    const owner = yield* claim(runs, run.id);
    const { agent, onProgress, pass, path, vfs } = options;
    const completed = priorTrace ? foldCompleted(priorTrace) : undefined;
    const pinned = new PinnedVFS(vfs, {
      path,
      versionId,
    });
    const graph = buildReviewGraph(pass, run.id);
    const kindOf = new Map(
      graph.nodes.map((node) => [node.id, node.kind] as const),
    );
    const tracker = onProgress
      ? new ReviewProgressTracker(onProgress, kindOf)
      : undefined;
    const recorder = options.traceStore.recorder(
      { wsId: options.wsId, runId: run.id },
      tracker ? (event) => tracker.handle(event) : undefined,
      seq,
    );

    // Prove life right away, then stay proven on the interval.
    const fiber = yield* Effect.forkChild(
      heartbeatLoop(runs, options.wsId, run.id, owner),
    );

    const flow = new FlowRunner<ReviewTypes>({
      runners: createReviewRunners({
        agent,
        pinned,
      }),
      onEvent: async (event) => {
        await recorder.record(event);
      },
    });

    const flowOutcome = yield* Effect.result(
      Effect.tryPromise({
        try: () => flow.run(graph, { completed }),
        catch: (caught) => caught,
      }),
    );
    // Stopping the loop cannot race an in-flight beat (uninterruptible) and
    // cannot clobber the terminal state that follows.
    yield* Fiber.interrupt(fiber);

    if (Result.isFailure(flowOutcome)) {
      const caught = flowOutcome.failure;
      const message = caught instanceof Error ? caught.message : String(caught);
      return yield* fail(runs, run, message);
    }

    const result = flowOutcome.success;
    if (result.status === "failed") {
      return yield* fail(runs, run, result.errors.join("; "));
    }

    // A pass with no summary unit commits none, and `one` throws.
    // TODO -- once a pass can carry several summary units, add a node
    // taking those `summary` artifacts and producing one `writeup`
    // artifact, so the run yields a single value here.
    const tail = yield* Effect.result(
      Effect.gen(function* () {
        const summary = yield* Effect.try({
          try: () => view<ReviewTypes>(result.artifacts).one("summary"),
          catch: asMessage,
        });
        yield* Effect.tryPromise({
          try: () => pinned.migrateMarks(path, versionId),
          catch: asMessage,
        });
        const done = yield* runs
          .completeRun(run.id, summary)
          .pipe(Effect.mapError(asMessage));
        return { summary, done };
      }),
    );
    if (Result.isFailure(tail)) {
      return yield* fail(runs, run, tail.failure);
    }
    return tail.success.done ?? run;
  });
}

function asMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function fail(
  runs: Context.Service.Shape<typeof ReviewRuns>,
  run: ReviewRun,
  error: string,
): Effect.Effect<ReviewRun, RunnerError, WorkspaceId> {
  return Effect.gen(function* () {
    const failed = yield* runs.failRun(run.id, error);
    return failed ?? run;
  });
}
