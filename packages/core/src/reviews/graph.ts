import type { Agent } from "@/agent.ts";
import type { PassWhenSpec } from "@/flow/helpers.ts";
import { passWhen } from "@/flow/helpers.ts";
import type { FlowTypes, NodeRunners } from "@/flow/types.ts";
import type { Analysis } from "@/reviews/steps/analyze.ts";
import { createAnalyzeRunner } from "@/reviews/steps/analyze.ts";
import type { MarkProposal } from "@/reviews/steps/mark.ts";
import {
  createApplyRunner,
  createMarkApplier,
  createProposeRunner,
  createRepairProposeRunner,
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

/** Events a review node emits on the flow; the trace stamps nodeId onto
 * them. */
export type ReviewNodeEvent =
  | { type: "prompt"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "output"; output: unknown }
  | { type: "usage"; usage: ReviewTraceUsage }
  | { type: "applied"; attempts: MarkAttempt[] };

/** The review host's typing vocabulary. */
export interface ReviewTypes extends FlowTypes {
  nodes: {
    source: undefined;
    analyze: Prompts;
    propose: Prompts;
    /** Re-proposes corrected marks for failed attempts. */
    repairPropose: Prompts;
    apply: { allowedLabels: readonly string[]; provenance: MarkProvenance };
    gate: PassWhenSpec<ReviewTypes>;
    synthesize: Prompts;
  };
  artifacts: {
    /** Numbered content of the pinned version. */
    content: string;
    analysis: Analysis;
    proposals: MarkProposal[];
    placed: MarkAttempt[];
    /** Only committed when non-empty; repair gates key on it. */
    failed: MarkAttempt[];
    summary: string;
  };
}

/** One runner set per review run: the applier queue is shared, so mark
 * application serializes across all apply nodes. */
export function createReviewRunners(options: {
  agent: Agent;
  pinned: PinnedVFS;
}): NodeRunners<ReviewTypes> {
  return {
    source: createSourceRunner(options.pinned),
    analyze: createAnalyzeRunner(options.agent),
    propose: createProposeRunner(options.agent),
    repairPropose: createRepairProposeRunner(options.agent),
    apply: createApplyRunner(createMarkApplier(options.pinned)),
    gate: passWhen<ReviewTypes, "gate">(),
    synthesize: createSynthesizeRunner(options.agent),
  };
}
