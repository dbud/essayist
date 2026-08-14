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
  variables: z.string().array().optional(),
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

/** Known tool names. */
export const ToolNameSchema = z.enum([
  "read_file",
  "list_files",
  "grep",
  "mark",
  "write_file",
]);
export type ToolName = z.infer<typeof ToolNameSchema>;

/** A review pass. */
export const ReviewPassSchema = z.object({
  id: z.string(),
  name: z.string(),
  modelPoolId: z.string(),
  /** Prompt key for the system message. */
  systemPromptKey: z.string(),
  /** Prompt key for the per-file review directive (supports {{file}}). */
  directivePromptKey: z.string(),
  /** Optional prompt key for additional instructions. */
  instructionsPromptKey: z.string().optional(),
  /** Inline instructions. */
  instructions: z.string().optional(),
  enabledTools: ToolNameSchema.array(),
  allowedCategoryIds: z.string().array(),
  maxRounds: z.number().int().positive().default(5),
  /** Static variable values for prompt rendering. */
  variables: z.record(z.string(), z.string()).optional(),
});
export type ReviewPass = z.infer<typeof ReviewPassSchema>;

// -- resolved bundle (computed, not stored) --

/** Resolved config for the agent runner, produced by ConfigStore.resolveActiveReviewPass. */
export interface ResolvedReviewPass {
  reviewPass: ReviewPass;
  /** Ordered model refs. */
  modelRefs: string[];
  /** Env var name holding the API key. */
  apiKeyEnvKey: string;
  /** Rendered system prompt. */
  systemPrompt: string;
  /** Review directive template ({{file}} unresolved). */
  directive: string;
  /** Rendered instructions. */
  instructions: string;
  /** Allowed categories. */
  categories: Category[];
  /** Category labels. */
  allowedLabels: string[];
}
