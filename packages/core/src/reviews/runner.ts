import type { Agent } from "@/agent.ts";
import type { ResolvedReviewPass } from "@/config/types.ts";
import { FlowRunner } from "@/flow/runner.ts";
import { view } from "@/flow/view.ts";
import { logger } from "@/logger.ts";
import { buildReviewGraph } from "@/reviews/adapter.ts";
import { createReviewRunners, type ReviewTypes } from "@/reviews/graph.ts";
import type { ReviewProgress } from "@/reviews/progress.ts";
import { ReviewProgressTracker } from "@/reviews/progress.ts";
import type { ReviewStore } from "@/reviews/store.ts";
import { foldCompleted } from "@/reviews/trace/mod.ts";
import type { TraceEvent, TraceStore } from "@/reviews/trace/types.ts";
import type { ReviewRun } from "@/reviews/types.ts";
import { SerialTasks } from "@/utils/serial.ts";
import { PinnedVFS } from "@/vfs/pin.ts";
import type { VFS } from "@/vfs/types.ts";

/** Options for {@linkcode runReviewPass}. */
export interface RunReviewPassOptions {
  agent: Agent;
  vfs: VFS;
  reviewStore: ReviewStore;
  traceStore: TraceStore;
  pass: ResolvedReviewPass;
  wsId: string;
  path: string;
  /** Receives text-free progress snapshots as the run advances. */
  onProgress?: (progress: ReviewProgress) => void;
}

// Heartbeats go out on flow events, and a timer covers the quiet stretch
// of a model call. The interval must stay far under the staleness window,
// or a live run can be stolen.
const HEARTBEAT_MS = 60_000;
const HEARTBEAT_STALE_MS = 15 * 60_000;

/** Run a review pass over a file version. */
export async function runReviewPass(
  options: RunReviewPassOptions,
): Promise<ReviewRun> {
  const { vfs, path } = options;
  const versionId = (await vfs.getHistory(path)).at(-1)?.version_id;
  if (!versionId) {
    throw new Error(`File not found: ${path}`);
  }
  return await start(options, versionId);
}

/** Continue a run that did not finish, over the version it started on. */
export async function resumeReviewPass(
  options: RunReviewPassOptions,
  runId: string,
): Promise<ReviewRun> {
  const { reviewStore, wsId } = options;
  const run = await reviewStore.getRun({ wsId, id: runId });
  if (!run?.versionId) {
    throw new Error(`Cannot resume: no run ${runId}`);
  }
  return await resume(options, run, run.versionId);
}

async function start(
  options: RunReviewPassOptions,
  versionId: string,
): Promise<ReviewRun> {
  const { pass, path, reviewStore, wsId } = options;
  const run = await reviewStore.createRun({
    wsId,
    path,
    reviewPassId: pass.pass.id,
    versionId,
  });
  return await execute(options, run, versionId, 0, undefined);
}

async function resume(
  options: RunReviewPassOptions,
  run: ReviewRun,
  versionId: string,
): Promise<ReviewRun> {
  const priorTrace = await options.traceStore.get({
    wsId: options.wsId,
    runId: run.id,
  });
  const priorLastSeq = priorTrace?.at(-1)?.seq;
  const seq = priorLastSeq === undefined ? 0 : priorLastSeq + 1;
  return await execute(options, run, versionId, seq, priorTrace);
}

/** Claim the lease on the run for a new owner. Throws when another
 * driver holds a live lease. */
async function claimRun(
  options: RunReviewPassOptions,
  runId: string,
): Promise<string> {
  const owner = crypto.randomUUID();
  const claimed = await options.reviewStore.claimRun(
    { wsId: options.wsId, id: runId },
    { owner, heartbeatAtLeast: Date.now() - HEARTBEAT_STALE_MS },
  );
  if (!claimed) {
    throw new Error(`Run ${runId} is claimed by another driver`);
  }
  return owner;
}

async function execute(
  options: RunReviewPassOptions,
  run: ReviewRun,
  versionId: string,
  seq: number,
  priorTrace: TraceEvent[] | undefined,
): Promise<ReviewRun> {
  const owner = await claimRun(options, run.id);
  const { agent, onProgress, pass, path, reviewStore, vfs, wsId, traceStore } =
    options;
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
  const recorder = traceStore.recorder(
    { wsId, runId: run.id },
    tracker ? (event) => tracker.handle(event) : undefined,
    seq,
  );

  let warnedLeaseLost = false;
  const beats = new SerialTasks();
  const beat = (): Promise<void> =>
    beats.add(async () => {
      try {
        const held = await reviewStore.heartbeatRun(
          { wsId, id: run.id },
          owner,
        );
        if (!held && !warnedLeaseLost) {
          warnedLeaseLost = true;
          logger.warn({ runId: run.id }, "review run lease lost");
        }
      } catch (error) {
        logger.error({ err: error }, "review run heartbeat failed");
      }
    });

  const flow = new FlowRunner<ReviewTypes>({
    runners: createReviewRunners({
      agent,
      pinned,
    }),
    onEvent: async (event) => {
      await recorder.record(event);
      await beat();
    },
  });

  const timer = setInterval(() => void beat(), HEARTBEAT_MS);
  // Stopping waits for beats in flight, so the finish cannot race one.
  const stopBeats = async (): Promise<void> => {
    clearInterval(timer);
    await beats.drain();
  };

  try {
    const result = await flow.run(graph, { completed });
    await stopBeats();
    if (result.status === "failed") {
      return await fail(options, run, result.errors.join("; "));
    }
    // A pass with no summary unit commits none, and `one` throws.
    // TODO -- once a pass can carry several summary units, add a node
    // taking those `summary` artifacts and producing one `writeup`
    // artifact, so the run yields a single value here.
    const summary = view<ReviewTypes>(result.artifacts).one("summary");
    await pinned.migrateMarks(path, versionId);
    const done = await options.reviewStore.completeRun({
      wsId,
      id: run.id,
      summary,
    });
    return done ?? run;
  } catch (caught) {
    await stopBeats();
    const message = caught instanceof Error ? caught.message : String(caught);
    return await fail(options, run, message);
  }
}

async function fail(
  options: RunReviewPassOptions,
  run: ReviewRun,
  error: string,
): Promise<ReviewRun> {
  const { reviewStore, wsId } = options;
  const failed = await reviewStore.failRun({ wsId, id: run.id, error });
  return failed ?? run;
}
