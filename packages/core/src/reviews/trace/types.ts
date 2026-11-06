import { Schema, Tuple } from "effect";

import { ReviewNodeEvent } from "#/reviews/graph.ts";
import { AnalysisSchema } from "#/reviews/steps/analyze.ts";
import { MarkProposalSchema } from "#/reviews/steps/mark.ts";
import { MarkAttempt } from "#/reviews/types.ts";

/**
 * One committed artifact. The engine pairs type with data at construction, so storage validates the
 * data payloads but not their pairing. The field types mirror the engine's Artifact record; a per-
 * kind union would not, because TS does not distribute the engine's generic instantiation.
 */
const ArtifactRow = Schema.Struct({
  type: Schema.Literals([
    "content",
    "analysis",
    "mark.proposals",
    "mark.placed",
    "mark.failed",
    "summary",
  ]),
  data: Schema.Union([
    Schema.String,
    AnalysisSchema,
    Schema.Array(MarkProposalSchema),
    Schema.mutable(Schema.Array(MarkAttempt)),
  ]),
  producedBy: Schema.String,
});

const NodeRun = Schema.Union([
  Schema.Struct({
    nodeId: Schema.String,
    status: Schema.Literal("completed"),
    startedAt: Schema.Number,
    completedAt: Schema.Number,
    artifacts: Schema.mutable(Schema.Array(ArtifactRow)),
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
