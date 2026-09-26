import type { z } from "zod";
import type { Agent, StructuredCall } from "@/agent.ts";
import type { ResolvedReviewPass, ResolvedStep } from "@/config/types.ts";
import { callStructured, stepRecorder } from "@/reviews/call.ts";
import { composeStepInput, type StepRunContext } from "@/reviews/context.ts";
import type { ReviewProgress } from "@/reviews/progress.ts";
import { ReviewProgressTracker } from "@/reviews/progress.ts";
import { AnalysisSchema } from "@/reviews/steps/analyze.ts";
import { composeRepairInput } from "@/reviews/steps/compose.ts";
import { applyMarks, ProposedMarksSchema } from "@/reviews/steps/mark.ts";
import { StepSummarySchema } from "@/reviews/steps/synthesize.ts";
import type { ReviewStore } from "@/reviews/store.ts";
import type { TraceStore } from "@/reviews/trace.ts";
import type {
  MarkAttempt,
  ReviewRun,
  ReviewTraceSink,
  StepRun,
} from "@/reviews/types.ts";
import { PinnedVFS } from "@/vfs/pin.ts";
import type { MarkProvenance, VFS } from "@/vfs/types.ts";

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

const NOOP_SINK: ReviewTraceSink = {
  record: () => {},
  flush: () => Promise.resolve(),
};

/** Run a review pass over a file version. */
export async function runReviewPass(
  options: RunReviewPassOptions,
): Promise<ReviewRun> {
  const { vfs, path } = options;
  const history = await vfs.getHistory(path);
  const versionId = history.at(-1)?.version_id;
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

/** Executes the steps of a review pass over one pinned file version. */
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
  #recorder: ReviewTraceSink = NOOP_SINK;
  #run!: ReviewRun;
  #stepCtx!: StepRunContext;
  #steps: StepRun[] = [];
  #summary: string | undefined;

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
    await this.#startRun();
    this.#stepCtx = await this.#prepareStepCtx();
    for (const resolved of this.#pass.steps) {
      const stepRun = await this.#runStep(resolved);
      this.#steps.push(stepRun);
      await this.#persistSteps();
      if (stepRun.status === "failed") {
        return await this.#finalize({
          error: stepRun.error ?? `step "${stepRun.stepId}" failed`,
        });
      }
    }
    return await this.#finalize({ summary: this.#summary });
  }

  async #startRun(): Promise<void> {
    const progress = this.#onProgress
      ? new ReviewProgressTracker(this.#onProgress)
      : undefined;
    this.#run = await this.#reviewStore.createRun({
      wsId: this.#wsId,
      path: this.#path,
      reviewPassId: this.#pass.pass.id,
      versionId: this.#versionId,
    });
    this.#recorder =
      this.#traceStore?.recorder(
        { wsId: this.#wsId, runId: this.#run.id },
        progress ? (event) => progress.handle(event) : undefined,
      ) ?? NOOP_SINK;
  }

  async #prepareStepCtx(): Promise<StepRunContext> {
    const { content } = await this.#pinned.read(this.#path, {
      numbered: true,
    });
    return {
      content,
      artifacts: new Map(),
      priorMarks: [], // TODO -- inject prior marks on subsequent reviews
      steps: this.#pass.steps,
    };
  }

  async #persistSteps(): Promise<void> {
    await this.#reviewStore.setRunSteps({
      wsId: this.#wsId,
      id: this.#run.id,
      steps: this.#steps,
    });
  }

  async #runStep(resolved: ResolvedStep): Promise<StepRun> {
    const stepId = resolved.step.id;
    const stepRun: StepRun = {
      stepId,
      name: resolved.step.name,
      kind: resolved.step.kind,
      status: "running",
      startedAt: Date.now(),
    };
    this.#recorder.record({
      type: "step_start",
      stepId,
      stepName: resolved.step.name,
      kind: resolved.step.kind,
    });
    try {
      switch (resolved.step.kind) {
        case "analyze":
          await this.#runAnalyzeStep(resolved);
          break;
        case "mark":
          await this.#runMarkStep(resolved, stepRun);
          break;
        case "synthesize":
          await this.#runSynthesizeStep(resolved);
          break;
      }
      this.#recorder.record({ type: "step_end", stepId });
      stepRun.status = "completed";
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      stepRun.status = "failed";
      stepRun.error = message;
      this.#recorder.record({ type: "step_error", stepId, error: message });
    }
    stepRun.completedAt = Date.now();
    return stepRun;
  }

  async #runAnalyzeStep(resolved: ResolvedStep): Promise<void> {
    const result = await this.#callStructured(
      resolved,
      composeStepInput(resolved, this.#stepCtx),
      AnalysisSchema,
    );
    this.#stepCtx.artifacts.set(resolved.step.id, result.output);
  }

  async #runMarkStep(resolved: ResolvedStep, stepRun: StepRun): Promise<void> {
    const attempts = await this.#proposeAndApply(
      resolved,
      composeStepInput(resolved, this.#stepCtx),
    );
    this.#recorder.record({
      type: "marks_applied",
      stepId: resolved.step.id,
      attempts,
    });
    let failed = attempts.filter((attempt) => !attempt.marked);
    let round = 0;
    const repairRounds = resolved.step.repairRounds ?? 1;
    while (failed.length > 0 && round < repairRounds) {
      round += 1;
      this.#recorder.record({
        type: "step_repair",
        stepId: resolved.step.id,
        round,
      });
      const repaired = await this.#proposeAndApply(
        resolved,
        composeRepairInput(
          {
            system: resolved.systemPrompt,
            instructions: resolved.instructions,
          },
          this.#stepCtx.content,
          failed,
        ),
      );
      this.#recorder.record({
        type: "marks_applied",
        stepId: resolved.step.id,
        attempts: repaired,
      });
      attempts.push(...repaired);
      failed = repaired.filter((attempt) => !attempt.marked);
    }
    stepRun.marksProposed = attempts.length;
    stepRun.marksPlaced = attempts.filter((attempt) => attempt.marked).length;
    stepRun.marksFailed = failed.length;
    stepRun.repairRoundsUsed = round;
  }

  async #runSynthesizeStep(resolved: ResolvedStep): Promise<void> {
    const result = await this.#callStructured(
      resolved,
      composeStepInput(resolved, this.#stepCtx),
      StepSummarySchema,
    );
    this.#summary = result.output.summary;
  }

  async #callStructured<T extends z.ZodObject<z.ZodRawShape>>(
    resolved: ResolvedStep,
    input: string,
    schema: T,
  ): Promise<StructuredCall<z.output<T>>> {
    return await callStructured({
      agent: this.#agent,
      onEvent: stepRecorder(this.#recorder, resolved.step.id),
      input,
      models: resolved.modelRefs,
      schema,
    });
  }

  async #proposeAndApply(
    resolved: ResolvedStep,
    input: string,
  ): Promise<MarkAttempt[]> {
    const result = await this.#callStructured(
      resolved,
      input,
      ProposedMarksSchema,
    );
    return await applyMarks(
      this.#pinned,
      result.output,
      resolved.allowedLabels,
      this.#provenance(resolved),
    );
  }

  #provenance(resolved: ResolvedStep): MarkProvenance {
    return { runId: this.#run.id, stepId: resolved.step.id };
  }

  async #finalize(outcome: {
    summary?: string;
    error?: string;
  }): Promise<ReviewRun> {
    await this.#recorder.flush();
    await this.#pinned.migrateMarks(this.#path, this.#versionId);
    if (outcome.error !== undefined) {
      const failed = await this.#reviewStore.failRun({
        wsId: this.#wsId,
        id: this.#run.id,
        error: outcome.error,
      });
      return failed ?? this.#run;
    }
    const completed = await this.#reviewStore.completeRun({
      wsId: this.#wsId,
      id: this.#run.id,
      summary: outcome.summary ?? "",
    });
    return completed ?? this.#run;
  }
}
