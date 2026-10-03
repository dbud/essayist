import type { Agent } from "@/agent.ts";
import type { ResolvedReviewPass } from "@/config/types.ts";
import { FlowRunner } from "@/flow/runner.ts";
import { view } from "@/flow/view.ts";
import { buildReviewGraph } from "@/reviews/adapter.ts";
import { createReviewRunners, type ReviewTypes } from "@/reviews/graph.ts";
import type { ReviewProgress } from "@/reviews/progress.ts";
import { ReviewProgressTracker } from "@/reviews/progress.ts";
import type { ReviewStore } from "@/reviews/store.ts";
import type { TraceRecorder, TraceStore } from "@/reviews/trace/types.ts";
import type { ReviewRun } from "@/reviews/types.ts";
import { PinnedVFS } from "@/vfs/pin.ts";
import type { VFS } from "@/vfs/types.ts";

/** Options for {@linkcode runReviewPass}. */
export interface RunReviewPassOptions {
  agent: Agent;
  vfs: VFS;
  reviewStore: ReviewStore;
  traceStore?: TraceStore;
  pass: ResolvedReviewPass;
  wsId: string;
  path: string;
  /** Receives text-free progress snapshots as the run advances. */
  onProgress?: (progress: ReviewProgress) => void;
}

const NOOP_RECORDER: TraceRecorder = {
  record: () => {},
  flush: () => Promise.resolve(),
};

/** Run a review pass over a file version. */
export async function runReviewPass(
  options: RunReviewPassOptions,
): Promise<ReviewRun> {
  const { vfs, path } = options;
  const versionId = (await vfs.getHistory(path)).at(-1)?.version_id;
  if (!versionId) {
    const missing = await options.reviewStore.createRun({
      wsId: options.wsId,
      path: options.path,
      reviewPassId: options.pass.pass.id,
    });
    return (
      (await options.reviewStore.failRun({
        wsId: options.wsId,
        id: missing.id,
        error: `File not found: ${options.path}`,
      })) ?? missing
    );
  }
  return await new ReviewPassRunner(options, versionId).run();
}

/** Executes a review pass as a flow over a pinned file version. */
class ReviewPassRunner {
  #agent: Agent;
  #reviewStore: ReviewStore;
  #traceStore?: TraceStore;
  #pass: ResolvedReviewPass;
  #wsId: string;
  #path: string;
  #onProgress?: (progress: ReviewProgress) => void;
  #pinned: PinnedVFS;
  #versionId: string;

  constructor(options: RunReviewPassOptions, versionId: string) {
    this.#agent = options.agent;
    this.#reviewStore = options.reviewStore;
    this.#traceStore = options.traceStore;
    this.#pass = options.pass;
    this.#wsId = options.wsId;
    this.#path = options.path;
    this.#onProgress = options.onProgress;
    this.#pinned = new PinnedVFS(options.vfs, {
      path: options.path,
      versionId,
    });
    this.#versionId = versionId;
  }

  async run(): Promise<ReviewRun> {
    const run = await this.#reviewStore.createRun({
      wsId: this.#wsId,
      path: this.#path,
      reviewPassId: this.#pass.pass.id,
      versionId: this.#versionId,
    });
    const graph = buildReviewGraph(this.#pass, run.id);
    const kindOf = new Map(
      graph.nodes.map((node) => [node.id, node.kind] as const),
    );
    const tracker = this.#onProgress
      ? new ReviewProgressTracker(this.#onProgress, kindOf)
      : undefined;
    const recorder =
      this.#traceStore?.recorder(
        { wsId: this.#wsId, runId: run.id },
        tracker ? (event) => tracker.handle(event) : undefined,
      ) ?? NOOP_RECORDER;
    const flow = new FlowRunner<ReviewTypes>({
      runners: createReviewRunners({
        agent: this.#agent,
        pinned: this.#pinned,
      }),
      onEvent: (event) => recorder.record(event),
    });

    try {
      const result = await flow.run(graph);
      if (result.status === "failed") {
        return await this.#finalize(run, recorder, {
          error: result.errors.join("; "),
        });
      }
      // A pass with no summary unit commits none, and `one` throws.
      // TODO -- once a pass can carry several summary units, add a node
      // taking those `summary` artifacts and producing one `writeup`
      // artifact, so the run yields a single value here.
      const summary = view<ReviewTypes>(result.artifacts).one("summary");
      return await this.#finalize(run, recorder, { summary });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      return await this.#finalize(run, recorder, { error: message });
    }
  }

  async #finalize(
    run: ReviewRun,
    recorder: TraceRecorder,
    outcome: { summary?: string; error?: string },
  ): Promise<ReviewRun> {
    await recorder.flush();
    await this.#pinned.migrateMarks(this.#path, this.#versionId);
    if (outcome.error !== undefined) {
      return (
        (await this.#reviewStore.failRun({
          wsId: this.#wsId,
          id: run.id,
          error: outcome.error,
        })) ?? run
      );
    }
    const completed = await this.#reviewStore.completeRun({
      wsId: this.#wsId,
      id: run.id,
      summary: outcome.summary ?? "",
    });
    return completed ?? run;
  }
}
