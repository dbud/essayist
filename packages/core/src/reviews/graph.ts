import { Schema } from "effect";

import type { ResolvedReviewUnit } from "#/config/types.ts";
import type { Files } from "#/files/service.ts";
import type { ForwardSpec, PassWhenSpec } from "#/flow/helpers.ts";
import { forward, passWhen } from "#/flow/helpers.ts";
import type { FlowTypes, NodeRunners } from "#/flow/types.ts";
import type { Marks } from "#/marks/service.ts";
import type { MarkProvenance } from "#/marks/types.ts";
import { type ModelClient, ModelCallRecord } from "#/model/service.ts";
import { type Analysis, analyzeRunner } from "#/reviews/steps/analyze.ts";
import {
  type MarkProposal,
  markApplyRunner,
  markProposeRunner,
  markRepairRunner,
} from "#/reviews/steps/mark.ts";
import { sourceRunner } from "#/reviews/steps/source.ts";
import { synthesizeRunner } from "#/reviews/steps/synthesize.ts";
import { MarkAttempt } from "#/reviews/types.ts";
import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

export const ReviewNodeEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("prompt"), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("reasoning"), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("output"), output: Schema.Unknown }),
  Schema.Struct({ type: Schema.Literal("repair"), raw: Schema.String, error: Schema.String }),
  Schema.Struct({ type: Schema.Literal("retry"), attempt: Schema.Int, error: Schema.String }),
  Schema.Struct({ type: Schema.Literal("model_call"), call: ModelCallRecord }),
  Schema.Struct({
    type: Schema.Literal("applied"),
    attempts: Schema.mutable(Schema.Array(MarkAttempt)),
  }),
]);
export type ReviewNodeEvent = Schema.Schema.Type<typeof ReviewNodeEvent>;

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
