/**
 * The review pass driver as an Effect program: the run lifecycle (claim,
 * heartbeat, complete, fail) goes through the ReviewRuns service, the flow
 * engine runs as an Effect, and promise steps bridge through it one step at
 * a time.
 *
 * Heartbeats run interval-only: one loop fiber sleeps the interval between
 * beats, so beats never overlap and the staleness window (15 minutes vs a
 * 60-second interval) keeps a live run claimed without event pacing.
 */

import { type Context, Effect, Fiber, Result, Schema } from "effect";
import type { ResolvedReviewPass } from "@/config/types.ts";
import { Files } from "@/files/service.ts";
import { FlowRunner } from "@/flow/runner.ts";
import type { FlowEvent } from "@/flow/types.ts";
import { view } from "@/flow/view.ts";
import { logger } from "@/logger.ts";
import type { ModelClient } from "@/model/service.ts";
import type { MissingChunksError } from "@/persistence/chunked_values.ts";
import type {
  ConcurrentModificationError,
  PersistenceError,
} from "@/persistence/mod.ts";
import { buildReviewGraph } from "@/reviews/adapter.ts";
import {
  createReviewRunners,
  type ReviewServices,
  type ReviewTypes,
} from "@/reviews/graph.ts";
import type { ReviewProgress } from "@/reviews/progress.ts";
import { ReviewProgressTracker } from "@/reviews/progress.ts";
import { ReviewRuns } from "@/reviews/service.ts";
import { logTraceEvent } from "@/reviews/trace/log.ts";
import { foldCompleted } from "@/reviews/trace/mod.ts";
import { TraceEvents } from "@/reviews/trace/service.ts";
import type { TraceEvent } from "@/reviews/trace/types.ts";
import type { ReviewRun } from "@/reviews/types.ts";
import { PinnedVFS } from "@/vfs/pin.ts";
import type { VFS } from "@/vfs/types.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";

/** Options for {@linkcode runReviewPass}. */
export interface RunReviewPassOptions {
  vfs: VFS;
  pass: ResolvedReviewPass;
  wsId: string;
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
  | ModelClient;

// Heartbeats go out every interval. The interval must stay far under the
// staleness window, or a live run can be stolen.
const HEARTBEAT_MS = 60_000;
const HEARTBEAT_STALE_MS = 15 * 60_000;
/** How often the trace writer checks for buffered events. */
const TRACE_POLL_MS = 25;

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
    const history = yield* files.getHistory(path);
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
): Effect.Effect<ReviewRun, RunnerError, RunnerServices> {
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
): Effect.Effect<ReviewRun, RunnerError, RunnerServices> {
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    const traces = yield* TraceEvents;
    const owner = yield* claim(runs, run.id);
    const { onProgress, pass, path, vfs } = options;
    const completed = priorTrace ? foldCompleted(priorTrace) : undefined;
    const pinned = new PinnedVFS(vfs, {
      path,
      versionId,
    });
    const graph = buildReviewGraph(pass, run.id, { path, versionId });
    const kindOf = new Map(
      graph.nodes.map((node) => [node.id, node.kind] as const),
    );
    const tracker = onProgress
      ? new ReviewProgressTracker(onProgress, kindOf)
      : undefined;

    // Trace events are stamped here and appended by a loop fiber shortly
    // after; the buffer is flushed before the run reaches a terminal state.
    const pending: TraceEvent[] = [];
    const record = (event: FlowEvent<ReviewTypes>): void => {
      const entry: TraceEvent = {
        seq: seq++,
        at: Date.now(),
        ...event,
      };
      logTraceEvent(entry);
      tracker?.handle(entry);
      pending.push(entry);
    };
    const flushPending = Effect.gen(function* () {
      for (const entry of pending.splice(0)) {
        yield* Effect.uninterruptible(traces.append(run.id, entry));
      }
    });
    const writer = Effect.gen(function* () {
      while (true) {
        yield* flushPending;
        yield* Effect.sleep(TRACE_POLL_MS);
      }
    });

    // Prove life right away, then stay proven on the interval.
    const fiber = yield* Effect.forkChild(
      heartbeatLoop(runs, options.wsId, run.id, owner),
    );
    const writerFiber = yield* Effect.forkChild(writer);

    // The native steps read their services from context; the pinned VFS
    // serves the promise steps until they go native.
    const flow = new FlowRunner<ReviewTypes, ReviewServices>({
      runners: createReviewRunners({
        pinned,
      }),
      onEvent: (event) => {
        record(event);
        return Promise.resolve();
      },
    });

    const flowRun = flow
      .run(graph, { completed })
      .pipe(Effect.provideService(WorkspaceId, { wsId: options.wsId }));
    const flowOutcome = yield* Effect.result(flowRun);
    // The loops stop before the terminal write; an in-flight write is
    // uninterruptible, so it settles first, and the flush below catches
    // anything still buffered.
    yield* Fiber.interrupt(fiber);
    yield* Fiber.interrupt(writerFiber);
    yield* flushPending;

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
