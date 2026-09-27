import type { Agent } from "@/agent.ts";
import type { PassWhenSpec } from "@/flow/helpers.ts";
import { passWhen } from "@/flow/helpers.ts";
import type { FlowTypes, NodeRunners } from "@/flow/types.ts";
import type { Analysis } from "@/reviews/steps/analyze.ts";
import { createAnalyzeRunner } from "@/reviews/steps/analyze.ts";
import type { MarkProposal } from "@/reviews/steps/mark.ts";
import {
  createMarkApplier,
  createMarkApplyRunner,
  createMarkProposeRunner,
  createMarkRepairRunner,
} from "@/reviews/steps/mark.ts";
import { createSourceRunner } from "@/reviews/steps/source.ts";
import { createSynthesizeRunner } from "@/reviews/steps/synthesize.ts";
import type { MarkAttempt, ReviewTraceUsage } from "@/reviews/types.ts";
import type { PinnedVFS } from "@/vfs/pin.ts";
import type { MarkProvenance } from "@/vfs/types.ts";

/** Rendered prompts and models for a structured step call. */
export interface Prompts {
  system: string;
  directive: string;
  instructions: string;
  models: string[];
}

export type ReviewNodeEvent =
  | { type: "prompt"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "output"; output: unknown }
  | { type: "usage"; usage: ReviewTraceUsage }
  | { type: "applied"; attempts: MarkAttempt[] };

export interface ReviewTypes extends FlowTypes {
  nodes: {
    source: undefined;
    analyze: Prompts;
    "mark.propose": Prompts;
    "mark.propose.repair": Prompts;
    "mark.apply": {
      allowedLabels: readonly string[];
      provenance: MarkProvenance;
    };
    "mark.repair.gate": PassWhenSpec<ReviewTypes>;
    synthesize: Prompts;
  };
  artifacts: {
    content: string;
    analysis: Analysis;
    "mark.proposals": MarkProposal[];
    "mark.placed": MarkAttempt[];
    "mark.failed": MarkAttempt[];
    summary: string;
  };
}

export function createReviewRunners(options: {
  agent: Agent;
  pinned: PinnedVFS;
}): NodeRunners<ReviewTypes> {
  return {
    source: createSourceRunner(options.pinned),
    analyze: createAnalyzeRunner(options.agent),
    "mark.propose": createMarkProposeRunner(options.agent),
    "mark.propose.repair": createMarkRepairRunner(options.agent),
    "mark.apply": createMarkApplyRunner(createMarkApplier(options.pinned)),
    "mark.repair.gate": passWhen<ReviewTypes, "mark.repair.gate">(),
    synthesize: createSynthesizeRunner(options.agent),
  };
}
