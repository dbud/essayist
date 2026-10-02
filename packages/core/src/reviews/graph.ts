import type { Agent, PostModelCallPayload } from "@/agent.ts";
import type { ResolvedReviewUnit } from "@/config/types.ts";
import type { ForwardSpec, PassWhenSpec } from "@/flow/helpers.ts";
import { forward, passWhen } from "@/flow/helpers.ts";
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
import type { MarkAttempt } from "@/reviews/types.ts";
import type { PinnedVFS } from "@/vfs/pin.ts";
import type { MarkProvenance } from "@/vfs/types.ts";

export type ReviewNodeEvent =
  | { type: "prompt"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "output"; output: unknown }
  | { type: "repair"; raw: string; error: string }
  | { type: "retry"; attempt: number; error: string }
  | { type: "model_call"; call: PostModelCallPayload }
  | { type: "applied"; attempts: MarkAttempt[] };

export interface ReviewTypes extends FlowTypes {
  events: ReviewNodeEvent;
  nodes: {
    source: undefined;
    analyze: ResolvedReviewUnit;
    "mark.propose": ResolvedReviewUnit;
    "mark.propose.repair": ResolvedReviewUnit;
    "mark.apply": {
      allowedLabels: readonly string[];
      provenance: MarkProvenance;
    };
    "mark.repair.gate": PassWhenSpec<ReviewTypes>;
    "mark.collect": ForwardSpec<ReviewTypes>;
    synthesize: ResolvedReviewUnit;
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
    "mark.collect": forward<ReviewTypes, "mark.collect">(),
    synthesize: createSynthesizeRunner(options.agent),
  };
}
