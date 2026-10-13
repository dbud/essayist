import type { ResolvedReviewUnit } from "@/config/types.ts";
import type { Files } from "@/files/service.ts";
import type { ForwardSpec, PassWhenSpec } from "@/flow/helpers.ts";
import { forward, passWhen } from "@/flow/helpers.ts";
import type { FlowTypes, NodeRunners } from "@/flow/types.ts";
import type { Marks } from "@/marks/service.ts";
import type { MarkProvenance } from "@/marks/types.ts";
import type { ModelCallRecord, ModelClient } from "@/model/service.ts";
import { type Analysis, analyzeRunner } from "@/reviews/steps/analyze.ts";
import {
  type MarkProposal,
  markApplyRunner,
  markProposeRunner,
  markRepairRunner,
} from "@/reviews/steps/mark.ts";
import { sourceRunner } from "@/reviews/steps/source.ts";
import { synthesizeRunner } from "@/reviews/steps/synthesize.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import type { WorkspaceId } from "@/workspace/WorkspaceId.ts";

export type ReviewNodeEvent =
  | { type: "prompt"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "output"; output: unknown }
  | { type: "repair"; raw: string; error: string }
  | { type: "retry"; attempt: number; error: string }
  | { type: "model_call"; call: ModelCallRecord }
  | { type: "applied"; attempts: MarkAttempt[] };

export interface ReviewTypes extends FlowTypes {
  events: ReviewNodeEvent;
  nodes: {
    source: { path: string; versionId: string };
    analyze: ResolvedReviewUnit;
    "mark.propose": ResolvedReviewUnit;
    "mark.propose.repair": ResolvedReviewUnit;
    "mark.apply": {
      path: string;
      versionId: string;
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
    "mark.proposals": readonly MarkProposal[];
    "mark.placed": MarkAttempt[];
    "mark.failed": MarkAttempt[];
    summary: string;
  };
}

/** The services the review graph's native steps consume. */
export type ReviewServices = Files | WorkspaceId | Marks | ModelClient;

export const reviewRunners: NodeRunners<ReviewTypes, ReviewServices> = {
  source: sourceRunner,
  analyze: analyzeRunner,
  "mark.propose": markProposeRunner,
  "mark.propose.repair": markRepairRunner,
  "mark.apply": markApplyRunner,
  "mark.repair.gate": passWhen<ReviewTypes, "mark.repair.gate">(),
  "mark.collect": forward<ReviewTypes, "mark.collect">(),
  synthesize: synthesizeRunner,
};
