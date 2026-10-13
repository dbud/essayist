import { Schema } from "effect";

// Config entities stored in KV under the ["cfg", ...] prefix.

// model pools
/** An ordered pool of model ids. */
export const ModelPoolSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** Model ids in order. */
  models: Schema.Array(Schema.String),
});
export type ModelPool = typeof ModelPoolSchema.Type;

// prompts
/** A named prompt template with {{var}} placeholders. */
export const PromptSchema = Schema.Struct({
  /** Stable name. */
  key: Schema.String,
  body: Schema.String,
});
export type Prompt = typeof PromptSchema.Type;

// categories (mark labels)
/** An allowed mark label. */
export const CategorySchema = Schema.Struct({
  id: Schema.String,
  /** Short label. */
  label: Schema.String,
  description: Schema.optionalKey(Schema.String),
  /** Severity hint. */
  severity: Schema.optionalKey(Schema.String),
  color: Schema.optionalKey(Schema.String),
});
export type Category = typeof CategorySchema.Type;

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
      repairRounds: Schema.optionalKey(
        Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      ),
    }),
  ),
  /** Marks the unit's artifact as the run summary. */
  summary: Schema.optionalKey(Schema.Boolean),
});
export type ReviewUnit = typeof ReviewUnitSchema.Type;

/** A review pass: an ordered pipeline of units over a pinned file version. */
export const ReviewPassSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The shared system prompt, rendered once for all units. */
  systemPromptKey: Schema.String,
  modelPoolId: Schema.String,
  units: Schema.Array(ReviewUnitSchema),
  /** Static variable values for prompt rendering. */
  variables: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type ReviewPass = typeof ReviewPassSchema.Type;

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
  attempt?: { categories: Category[]; repairRounds: number };
  /** The unit's artifact is the run summary. */
  summary?: boolean;
}

/** Resolved config for a full pass, in unit order. */
export interface ResolvedReviewPass {
  pass: ReviewPass;
  units: ResolvedReviewUnit[];
}
