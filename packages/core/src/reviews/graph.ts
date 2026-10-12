import type { PostModelCallPayload } from "@/agent.ts";
import type { ResolvedReviewUnit } from "@/config/types.ts";
import type { Files } from "@/files/service.ts";
import type { ForwardSpec, PassWhenSpec } from "@/flow/helpers.ts";
import { forward, passWhen } from "@/flow/helpers.ts";
import type { FlowTypes, NodeRunners } from "@/flow/types.ts";
import type { ModelClient } from "@/model/service.ts";
import { type Analysis, analyzeRunner } from "@/reviews/steps/analyze.ts";
import {
  createMarkApplier,
  createMarkApplyRunner,
  type MarkProposal,
  markProposeRunner,
  markRepairRunner,
} from "@/reviews/steps/mark.ts";
import { sourceRunner } from "@/reviews/steps/source.ts";
import { synthesizeRunner } from "@/reviews/steps/synthesize.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import type { PinnedVFS } from "@/vfs/pin.ts";
import type { MarkProvenance } from "@/vfs/types.ts";
import type { WorkspaceId } from "@/workspace/WorkspaceId.ts";

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
    source: { path: string; versionId: string };
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

/** The services the review graph's native steps consume. */
export type ReviewServices = Files | WorkspaceId | ModelClient;

export function createReviewRunners(options: {
  pinned: PinnedVFS;
}): NodeRunners<ReviewTypes, ReviewServices> {
  return {
    source: sourceRunner,
    analyze: analyzeRunner,
    "mark.propose": markProposeRunner,
    "mark.propose.repair": markRepairRunner,
    "mark.apply": createMarkApplyRunner(createMarkApplier(options.pinned)),
    "mark.repair.gate": passWhen<ReviewTypes, "mark.repair.gate">(),
    "mark.collect": forward<ReviewTypes, "mark.collect">(),
    synthesize: synthesizeRunner,
  };
}
