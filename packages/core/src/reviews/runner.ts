/**
 * The review pass driver as an Effect program: the run lifecycle (claim,
 * heartbeat, complete, fail) goes through the ReviewRuns service, and the
 * flow engine runs inside it.
 *
 * Heartbeats run interval-only: one loop fiber sleeps the interval between
 * beats, so beats never overlap and the staleness window (15 minutes vs a
 * 60-second interval) keeps a live run claimed without event pacing.
 */

import {
  type Cause,
  Clock,
  type Context,
  Effect,
  Fiber,
  Queue,
  Result,
  Schema,
} from "effect";
import type { ResolvedReviewPass } from "#/config/types.ts";
import { Files } from "#/files/service.ts";
import { FlowRunner } from "#/flow/runner.ts";
import type { FlowEvent } from "#/flow/types.ts";
import { view } from "#/flow/view.ts";
import { Ids } from "#/ids.ts";
import type { Marks } from "#/marks/service.ts";
import type { ModelClient } from "#/model/service.ts";
import type { MissingChunksError } from "#/persistence/chunked_values.ts";
import type {
  ConcurrentModificationError,
  PersistenceError,
} from "#/persistence/mod.ts";
import { buildReviewGraph } from "#/reviews/adapter.ts";
import {
  type ReviewServices,
  type ReviewTypes,
  reviewRunners,
} from "#/reviews/graph.ts";
import type { ReviewProgress } from "#/reviews/progress.ts";
import { ReviewProgressTracker } from "#/reviews/progress.ts";
import { ReviewRuns } from "#/reviews/service.ts";
import { logTraceEvent } from "#/reviews/trace/log.ts";
import { foldCompleted } from "#/reviews/trace/mod.ts";
import { TraceEvents } from "#/reviews/trace/service.ts";
import type { TraceEvent } from "#/reviews/trace/types.ts";
import type { ReviewRun } from "#/reviews/types.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

/** Options for {@linkcode runReviewPass}. */
export interface RunReviewPassOptions {
  pass: ResolvedReviewPass;
  path: string;
  /** Receives text-free progress snapshots as the run advances. */
  onProgress?: (progress: ReviewProgress) => void;
}

/** Services the review pass runs on: the steps pull them from context. */
type RunnerServices =
  | ReviewRuns
  | TraceEvents
  | WorkspaceId
  | Files
  | Marks
  | ModelClient;

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
  | ConcurrentModificationError
  | MissingChunksError;

/** Run a review pass over a file version. */
export function runReviewPass(
  options: RunReviewPassOptions,
): Effect.Effect<ReviewRun, RunnerError, RunnerServices> {
  const { path } = options;
  return Effect.gen(function* () {
    const files = yield* Files;
    const versionId = yield* files.getHistory(path).pipe(
      Effect.catchTag("FileMissingError", () =>
        Effect.fail(new ReviewFileMissingError({ path })),
      ),
      Effect.map((history) => history.at(-1)?.version_id),
    );
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
): Effect.Effect<ReviewRun, RunnerError, RunnerServices> {
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    const run = yield* runs.getRun(runId);
    if (!run?.versionId) {
      return yield* Effect.fail(new ReviewRunMissingError({ runId }));
    }
    return yield* Effect.annotateLogs(resume(options, run, run.versionId), {
      runId: run.id,
    });
  });
}

/** Pick up a run's trace where the previous attempt left off. */
function resume(
  options: RunReviewPassOptions,
  run: ReviewRun,
  versionId: string,
): Effect.Effect<ReviewRun, RunnerError, RunnerServices> {
  return Effect.gen(function* () {
    const traces = yield* TraceEvents;
    const priorTrace = yield* traces.get(run.id);
    const priorLastSeq = priorTrace?.at(-1)?.seq;
    const seq = priorLastSeq === undefined ? 0 : priorLastSeq + 1;
    return yield* execute(options, run, versionId, seq, priorTrace);
  });
}

function start(
  options: RunReviewPassOptions,
  versionId: string,
): Effect.Effect<ReviewRun, RunnerError, RunnerServices> {
  const { pass, path } = options;
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    const run = yield* runs.createRun({
      path,
      reviewPassId: pass.pass.id,
      versionId,
    });
    return yield* Effect.annotateLogs(
      execute(options, run, versionId, 0, undefined),
      { runId: run.id },
    );
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
    const ids = yield* Ids;
    const owner = ids.next();
    const now = yield* Clock.currentTimeMillis;
    const claimed = yield* runs.claimRun(runId, {
      owner,
      heartbeatAtLeast: now - HEARTBEAT_STALE_MS,
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
        yield* Effect.logError("review run heartbeat failed", {
          error: asMessage(held.failure),
        });
      } else if (!held.success && !warnedLeaseLost) {
        warnedLeaseLost = true;
        yield* Effect.logWarning("review run lease lost", { runId });
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
): Effect.Effect<ReviewRun, RunnerError, RunnerServices> {
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    const traces = yield* TraceEvents;
    const { wsId } = yield* WorkspaceId;
    const owner = yield* claim(runs, run.id);
    const { onProgress, pass, path } = options;
    const completed = priorTrace ? foldCompleted(priorTrace) : undefined;
    const graph = buildReviewGraph(pass, run.id, { path, versionId });
    const kindOf = new Map(
      graph.nodes.map((node) => [node.id, node.kind] as const),
    );
    const tracker = onProgress
      ? new ReviewProgressTracker(onProgress, kindOf)
      : undefined;

    // Events are logged and seq-stamped where they happen; a writer fiber
    // appends them through a queue, off the emission path.
    const queue = yield* Queue.unbounded<TraceEvent, Cause.Done>();
    const record = (event: FlowEvent<ReviewTypes>): Effect.Effect<void> =>
      Effect.gen(function* () {
        const at = yield* Clock.currentTimeMillis;
        const entry: TraceEvent = {
          seq: seq++,
          at,
          ...event,
        };
        tracker?.handle(entry);
        yield* Queue.offer(queue, entry);
        yield* logTraceEvent(entry);
      });

    /** Appends until the queue ends; a storage fault fails the writer, and
     * joining it re-raises the fault into the run. */
    const writer = Effect.gen(function* () {
      while (true) {
        const next = yield* Effect.result(Queue.take(queue));
        if (Result.isFailure(next)) break;
        yield* Effect.uninterruptible(traces.append(run.id, next.success));
      }
    });

    // Prove life right away, then stay proven on the interval.
    const fiber = yield* Effect.forkChild(
      heartbeatLoop(runs, wsId, run.id, owner),
    );
    const writerFiber = yield* Effect.forkChild(writer);

    // The native steps read their services from context.
    const flow = new FlowRunner<ReviewTypes, ReviewServices>({
      runners: reviewRunners,
      onEvent: record,
    });

    const flowRun = flow
      .run(graph, { completed })
      .pipe(Effect.provideService(WorkspaceId, { wsId }));
    const flowOutcome = yield* Effect.result(flowRun);
    // The heartbeat stops before the terminal write. No more events arrive,
    // so the writer drains the queue and finishes; joining it stores the
    // whole trace before the run settles, and re-raises a storage fault.
    yield* Fiber.interrupt(fiber);
    yield* Queue.end(queue);
    yield* Fiber.join(writerFiber);

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
          catch: () => new SummaryMissingError(),
        });
        const files = yield* Files;
        yield* files.migrateMarks(path, versionId);
        const done = yield* runs.completeRun(run.id, summary);
        return { summary, done };
      }),
    );
    if (Result.isFailure(tail)) {
      return yield* fail(runs, run, asMessage(tail.failure));
    }
    return tail.success.done ?? run;
  });
}

/** The pass committed no summary artifact for the run to finish with. */
class SummaryMissingError extends Schema.TaggedError<SummaryMissingError>()(
  "SummaryMissingError",
  {},
) {
  override get message() {
    return "the run committed no summary artifact";
  }
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
