/** The review config a fresh database starts with. */

import { Effect, Option } from "effect";

import { ReviewConfig } from "./service.ts";
import { Category, ModelPool, Prompt, ReviewPass, type ReviewUnit } from "./types.ts";

export const DEFAULT_REVIEW_PASS_ID = "essay-review";

const pool = new ModelPool({
  id: "free-pool",
  name: "Free pool",
  models: ["stealth/space-bunny-alpha", "qwen/qwen3.8-27b:free"],
});

// a shared system prompt; units differentiate through directives
const systemPromptKey = "system.reviewer";

const prompts = [
  {
    key: systemPromptKey,
    body: "You are an experienced editor and writing teacher. You review the user's literary work and leave constructive, specific annotations. You never rewrite the work; you only read and judge it.",
  },
  {
    key: "directive.analyze",
    body: "Read the essay carefully. Describe the piece as its ideal reader would experience it: restate the thesis in your own words, name the intended audience, list the main claims in the order they are made, sketch a paragraph map keyed by line numbers, and note where the writing is strong and where a skeptical reader is likely to resist. Ground every observation in the text.",
  },
  {
    key: "directive.mechanics",
    body: "Scan the essay line by line for mechanical faults: grammar, spelling, punctuation, usage, and agreement. Flag only defects a careful copy editor would mark. For each, quote the exact span and say briefly what is wrong and how to fix it. Do not comment on style, argument, or organization.",
  },
  {
    key: "directive.structure",
    body: "Assess how the essay is organized: paragraph order, transitions, sectioning, and pacing. Flag places where the reader loses the thread, where two paragraphs should merge or split, or where material sits in the wrong order. Quote the span that shows the problem and say what to do about it. Do not comment on grammar or word choice.",
  },
  {
    key: "directive.argument",
    body: "First restate the essay's argument in its strongest form. Then find where a skeptical reader would not yet be persuaded: unsupported claims, weak or missing evidence, overreaching generalizations, and places where the body drifts from the thesis. Quote the exact span and explain the objection a skeptical reader would raise.",
  },
  {
    key: "directive.synthesize",
    body: "Write a short review summary for the writer. Lead with the one or two changes that matter most, then group the remaining marks by severity. Stay grounded in the marks provided; do not invent issues that have no mark.",
  },
  {
    key: "instructions.marks",
    body: "Every mark must quote the exact text from the numbered essay content. Use the allowed labels only. Comments are one or two sentences, specific and actionable. Place every mark you can defend; do not pad, and do not repeat an issue listed under a different aspect.",
  },
];

const categories = [
  {
    id: "evidence",
    label: "evidence",
    description: "Evidence and support",
    color: "oklch(72% 0.14 153)",
  },
  {
    id: "grammar",
    label: "grammar",
    description: "Grammar, mechanics, usage",
    color: "oklch(72% 0.11 326)",
  },
  {
    id: "structure",
    label: "structure",
    description: "Organization and flow",
    color: "oklch(82% 0.16 75)",
  },
  {
    id: "thesis",
    label: "thesis",
    description: "Thesis and argument clarity",
    color: "oklch(64% 0.15 251)",
  },
  {
    id: "tone",
    label: "tone",
    description: "Voice, tone, and register",
    color: "oklch(65% 0.4 300)",
  },
] as const;

const units: ReviewUnit[] = [
  {
    id: "analyze",
    promptKey: "directive.analyze",
  },
  {
    id: "mechanics",
    promptKey: "directive.mechanics",
    instructionsPromptKey: "instructions.marks",
    attempt: { allowedCategoryIds: ["grammar"] },
  },
  {
    id: "structure",
    promptKey: "directive.structure",
    instructionsPromptKey: "instructions.marks",
    attempt: { allowedCategoryIds: ["structure"] },
    inputs: ["analyze"],
  },
  {
    id: "argument",
    promptKey: "directive.argument",
    instructionsPromptKey: "instructions.marks",
    attempt: { allowedCategoryIds: ["thesis", "evidence"] },
    inputs: ["analyze"],
  },
  {
    id: "synthesize",
    promptKey: "directive.synthesize",
    summary: true,
    inputs: ["mechanics", "structure", "argument"],
  },
];

const pass = new ReviewPass({
  id: DEFAULT_REVIEW_PASS_ID,
  name: "Essay review",
  systemPromptKey,
  modelPoolId: pool.id,
  units,
  variables: Option.none(),
});

/**
 * Seed the default config into an empty store and make its pass active. The config is shared by
 * every workspace and edited by admins, so a store with any config in it is left as it is; false
 * then.
 */
export const seedDefaultConfig: Effect.Effect<boolean, never, ReviewConfig> = Effect.gen(
  function* () {
    const config = yield* ReviewConfig;
    const existing = yield* Effect.all([
      config.listModelPools(),
      config.listPrompts(),
      config.listCategories(),
      config.listReviewPasses(),
    ]);
    if (existing.some((items) => items.length > 0)) return false;
    yield* config.saveModelPool(pool);
    for (const prompt of prompts) yield* config.savePrompt(new Prompt(prompt));
    for (const { description, color, ...fields } of categories) {
      yield* config.saveCategory(
        new Category({
          ...fields,
          description: Option.some(description),
          severity: Option.none(),
          color: Option.some(color),
        }),
      );
    }
    yield* config.saveReviewPass(pass);
    yield* config.setActiveReviewPass(pass.id);
    return true;
  },
);
