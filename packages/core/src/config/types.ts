import { Schema } from "effect";
import { Model } from "effect/schema";

/** A config item that was looked up, or that a pass names, does not exist. */
export class ConfigMissingError extends Schema.TaggedError<ConfigMissingError>()(
  "ConfigMissingError",
  { what: Schema.String },
) {
  override get message() {
    return `Config missing: ${this.what}`;
  }
}

// model pools
/** An ordered pool of model ids. */
export class ModelPool extends Model.Class<ModelPool>("ModelPool")({
  id: Schema.String,
  name: Schema.String,
  /** Model ids in order. */
  models: Model.JsonFromString(Schema.Array(Schema.String)),
}) {}

// prompts
/** A named prompt template with {{var}} placeholders. */
export class Prompt extends Model.Class<Prompt>("Prompt")({
  /** Stable name. */
  key: Schema.String,
  body: Schema.String,
}) {}

// categories (mark labels)
/** An allowed mark label. */
export class Category extends Model.Class<Category>("Category")({
  id: Schema.String,
  /** Short label. */
  label: Schema.String,
  description: Model.FieldOption(Schema.String),
  /** Severity hint. */
  severity: Model.FieldOption(Schema.String),
  color: Model.FieldOption(Schema.String),
}) {}

// review passes
export const ReviewUnitSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  /** Per-unit task prompt. */
  promptKey: Schema.String,
  /** Shared fine print; falls back to none. */
  instructionsPromptKey: Schema.optionalKey(Schema.String),
  /** Falls back to the pass pool. */
  modelPoolId: Schema.optionalKey(Schema.String),
  /** Unit ids whose artifacts this unit receives as context. */
  inputs: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Adds the mark subgraph: propose, apply, and gated repair rounds. */
  attempt: Schema.optionalKey(
    Schema.Struct({
      /** Required non-empty. */
      allowedCategoryIds: Schema.Array(Schema.String),
      /** Repair calls for unmatched spans. Default 1. */
      repairRounds: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    }),
  ),
  /** Marks the unit's artifact as the run summary. */
  summary: Schema.optionalKey(Schema.Boolean),
});
export type ReviewUnit = typeof ReviewUnitSchema.Type;

/** A review pass: an ordered pipeline of units over a pinned file version. */
export class ReviewPass extends Model.Class<ReviewPass>("ReviewPass")({
  id: Schema.String,
  name: Schema.String,
  /** The shared system prompt, rendered once for all units. */
  systemPromptKey: Schema.String,
  modelPoolId: Schema.String,
  units: Model.JsonFromString(Schema.Array(ReviewUnitSchema)),
  /** Static variable values for prompt rendering. */
  variables: Model.FieldOption(Model.JsonFromString(Schema.Record(Schema.String, Schema.String))),
}) {}

// resolved bundles (computed, not stored)
/** Rendered prompts for a unit: pass system prompt plus unit task. */
export interface ResolvedPrompts {
  system: string;
  directive: string;
  instructions: string;
  /** The rendered allowed-labels section; empty for non-attempt units. */
  categories: string;
}

/** Resolved config for a unit, produced by resolveReviewPass. */
export interface ResolvedReviewUnit {
  id: string;
  prompts: ResolvedPrompts;
  /** The resolved model pool: ordered model refs plus the api key env. */
  pool: ModelPool;
  /** Unit ids whose artifacts this unit receives as context. */
  inputs: readonly string[];
  /** Mark attempt config; present only on attempt units. */
  attempt?: { categories: ReadonlyArray<Category>; repairRounds: number };
  /** The unit's artifact is the run summary. */
  summary?: boolean;
}

/** Resolved config for a full pass, in unit order. */
export interface ResolvedReviewPass {
  pass: ReviewPass;
  units: ResolvedReviewUnit[];
}
