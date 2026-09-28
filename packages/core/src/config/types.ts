import { z } from "zod";

// Config entities stored in KV under the ["cfg", ...] prefix.

// -- model pools --

/** An ordered pool of model ids. */
export const ModelPoolSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Model ids in order. */
  models: z.string().array(),
});
export type ModelPool = z.infer<typeof ModelPoolSchema>;

// -- prompts --

/** A named prompt template with {{var}} placeholders. */
export const PromptSchema = z.object({
  /** Stable name. */
  key: z.string(),
  body: z.string(),
});
export type Prompt = z.infer<typeof PromptSchema>;

// -- categories (mark labels) --

/** An allowed mark label. */
export const CategorySchema = z.object({
  id: z.string(),
  /** Short label. */
  label: z.string(),
  description: z.string().optional(),
  /** Severity hint. */
  severity: z.string().optional(),
  color: z.string().optional(),
});
export type Category = z.infer<typeof CategorySchema>;

// -- review passes --

export const ReviewUnitSchema = z.object({
  id: z.string().min(1),
  /** Per-unit task prompt. */
  promptKey: z.string(),
  /** Shared fine print; falls back to none. */
  instructionsPromptKey: z.string().optional(),
  /** Falls back to the pass pool. */
  modelPoolId: z.string().optional(),
  /** Unit ids whose artifacts this unit receives as context. */
  inputs: z.string().array().optional(),
  /** Adds the mark subgraph: propose, apply, and gated repair rounds. */
  attempt: z
    .object({
      /** Required non-empty. */
      allowedCategoryIds: z.string().array(),
      /** Repair calls for unmatched spans. Default 1. */
      repairRounds: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /** Marks the unit's artifact as the run summary. */
  summary: z.boolean().optional(),
});
export type ReviewUnit = z.infer<typeof ReviewUnitSchema>;

/** A review pass: an ordered pipeline of units over a pinned file version. */
export const ReviewPassSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The shared system prompt, rendered once for all units. */
  systemPromptKey: z.string(),
  modelPoolId: z.string(),
  units: ReviewUnitSchema.array(),
  /** Static variable values for prompt rendering. */
  variables: z.record(z.string(), z.string()).optional(),
});
export type ReviewPass = z.infer<typeof ReviewPassSchema>;

// -- resolved bundles (computed, not stored) --

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
  inputs: string[];
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
