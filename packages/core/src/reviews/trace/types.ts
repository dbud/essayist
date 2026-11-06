import { Schema, Tuple } from "effect";

import { ReviewNodeEvent } from "#/reviews/graph.ts";
import { AnalysisSchema } from "#/reviews/steps/analyze.ts";
import { MarkProposalSchema } from "#/reviews/steps/mark.ts";
import { MarkAttempt } from "#/reviews/types.ts";

const Artifact = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("content"),
    data: Schema.String,
    producedBy: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("analysis"),
    data: AnalysisSchema,
    producedBy: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("mark.proposals"),
    data: Schema.Array(MarkProposalSchema),
    producedBy: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("mark.placed"),
    data: Schema.mutable(Schema.Array(MarkAttempt)),
    producedBy: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("mark.failed"),
    data: Schema.mutable(Schema.Array(MarkAttempt)),
    producedBy: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("summary"),
    data: Schema.String,
    producedBy: Schema.String,
  }),
]);

const NodeRun = Schema.Union([
  Schema.Struct({
    nodeId: Schema.String,
    status: Schema.Literal("completed"),
    startedAt: Schema.Number,
    completedAt: Schema.Number,
    artifacts: Schema.mutable(Schema.Array(Artifact)),
  }),
  Schema.Struct({
    nodeId: Schema.String,
    status: Schema.Literal("failed"),
    startedAt: Schema.Number,
    completedAt: Schema.Number,
    error: Schema.String,
  }),
  Schema.Struct({
    nodeId: Schema.String,
    status: Schema.Literal("skipped"),
    reason: Schema.String,
  }),
]);

export const TraceEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("node_start") }),
  Schema.Struct({ type: Schema.Literal("node_end"), run: NodeRun }),
  Schema.Struct({ type: Schema.Literal("custom"), event: ReviewNodeEvent }),
]).mapMembers(
  Tuple.map(Schema.fieldsAssign({ seq: Schema.Int, at: Schema.Number, nodeId: Schema.String })),
);
export type TraceEvent = Schema.Schema.Type<typeof TraceEvent>;
