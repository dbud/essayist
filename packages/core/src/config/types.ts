import { z } from "zod";

// Config entities stored in KV under the ["cfg", ...] prefix.

// -- model pools --

/** An ordered pool of model ids. */
export const ModelPoolSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Model ids in order. */
  models: z.string().array(),
  /** Env var name holding the API key. Defaults to OPENROUTER_API_KEY. */
  apiKeyEnvKey: z.string().optional(),
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

/** What a step produces. */
export const StepKindSchema = z.enum(["understand", "mark", "synthesize"]);
export type StepKind = z.infer<typeof StepKindSchema>;

/**
 * One focused step in a review pass. Steps are single structured model calls;
 * the essay text is injected by the runner and steps never use tools.
 */
export const StepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: StepKindSchema,
  /** Falls back to the pass pool. */
  modelPoolId: z.string().optional(),
  systemPromptKey: z.string(),
  directivePromptKey: z.string(),
  instructionsPromptKey: z.string().optional(),
  /** Mark steps only, and required non-empty. */
  allowedCategoryIds: z.string().array().optional(),
  /** Step ids whose artifacts this step receives as context. */
  artifactsFromStepIds: z.string().array().optional(),
  /** Repair calls for unmatched spans; mark steps only. Default 1. */
  repairRounds: z.number().int().nonnegative().optional(),
});
export type Step = z.infer<typeof StepSchema>;

/** A review pass: an ordered pipeline of steps over one pinned file version. */
export const ReviewPassSchema = z.object({
  id: z.string(),
  name: z.string(),
  modelPoolId: z.string(),
  steps: StepSchema.array().min(1),
  /** Static variable values for prompt rendering. */
  variables: z.record(z.string(), z.string()).optional(),
});
export type ReviewPass = z.infer<typeof ReviewPassSchema>;

// -- resolved bundles (computed, not stored) --

/** Resolved config for one step, produced by ConfigStore.resolveReviewPass. */
export interface ResolvedStep {
  step: Step;
  /** Ordered model refs. */
  modelRefs: string[];
  /** Env var name holding the API key. */
  apiKeyEnvKey: string;
  /** Rendered system prompt. */
  systemPrompt: string;
  /** Rendered directive. */
  directive: string;
  /** Rendered instructions. */
  instructions: string;
  /** Allowed categories; empty for non-mark steps. */
  categories: Category[];
  /** Category labels; empty for non-mark steps. */
  allowedLabels: string[];
}

/** Resolved config for a full pass, in step order. */
export interface ResolvedReviewPass {
  pass: ReviewPass;
  steps: ResolvedStep[];
}
