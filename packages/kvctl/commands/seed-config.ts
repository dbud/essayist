import { Command } from "@cliffy/command";
import type { KvctlGlobals } from "@/globals.ts";
import { withKv } from "@/kv.ts";

export const seedConfig = new Command<KvctlGlobals>()
  .description("Seed default review config.")
  .action(({ target, local }) =>
    withKv({ target, local }, async ({ config }) => {
      const poolId = "free-pool";
      await config.saveModelPool({
        id: poolId,
        name: "Free pool",
        models: [
          "qwen/qwen3.8-27b:free",
          "poolside/laguna-s-2.1:free",
          "nvidia/nemotron-3.5-lightning:free",
        ],
      });

      // One shared reviewer persona; steps differentiate through directives.
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
      for (const p of prompts) await config.savePrompt(p);

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
      for (const c of categories) await config.saveCategory(c);

      const reviewPassId = "essay-review";
      const steps = [
        {
          id: "analyze",
          name: "Analyze",
          kind: "analyze" as const,
          systemPromptKey,
          directivePromptKey: "directive.analyze",
        },
        {
          id: "mechanics",
          name: "Mechanics",
          kind: "mark" as const,
          systemPromptKey,
          directivePromptKey: "directive.mechanics",
          instructionsPromptKey: "instructions.marks",
          allowedCategoryIds: ["grammar"],
        },
        {
          id: "structure",
          name: "Structure",
          kind: "mark" as const,
          systemPromptKey,
          directivePromptKey: "directive.structure",
          instructionsPromptKey: "instructions.marks",
          allowedCategoryIds: ["structure"],
          artifactsFromStepIds: ["analyze"],
        },
        {
          id: "argument",
          name: "Argument",
          kind: "mark" as const,
          systemPromptKey,
          directivePromptKey: "directive.argument",
          instructionsPromptKey: "instructions.marks",
          allowedCategoryIds: ["thesis", "evidence"],
          artifactsFromStepIds: ["analyze"],
        },
        {
          id: "synthesize",
          name: "Synthesize",
          kind: "synthesize" as const,
          systemPromptKey,
          directivePromptKey: "directive.synthesize",
        },
      ];
      await config.saveReviewPass({
        id: reviewPassId,
        name: "Essay review",
        modelPoolId: poolId,
        variables: {},
        steps,
      });
      await config.setActiveReviewPass(reviewPassId);

      console.log(
        `seeded default config: model pool '${poolId}', ${prompts.length} prompts, ${categories.length} categories, review pass '${reviewPassId}' with ${steps.length} steps (active)`,
      );
    }),
  );
