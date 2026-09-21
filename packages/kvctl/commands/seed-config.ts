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
          "poolside/laguna-s-2.1:free",
          "nvidia/nemotron-3.5-lightning:free",
        ],
      });

      // Default prompts are generic placeholders.
      const systemPromptKey = "system.reviewer";
      const instructionsPromptKey = "instructions.mark";
      const directivePromptKey = "directive.review";
      const prompts = [
        {
          key: systemPromptKey,
          body: "You are an experienced editor and writing teacher. You review the user's literary work and leave constructive, specific annotations. You never rewrite the work; you only read and mark it.",
        },
        {
          key: instructionsPromptKey,
          body: "Read the relevant files, then place all annotations for a file in a single mark call, passing every mark in the marks array. Each mark must use one of the allowed labels and a concise, actionable comment.",
        },
        {
          key: directivePromptKey,
          body: 'Review the file "{{file}}". Read it, then mark issues using the allowed labels.',
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
      await config.saveReviewPass({
        id: reviewPassId,
        name: "Essay review",
        modelPoolId: poolId,
        systemPromptKey,
        directivePromptKey,
        instructionsPromptKey,
        enabledTools: ["read_file", "list_files", "grep", "mark"],
        allowedCategoryIds: categories.map((c) => c.id),
        maxRounds: 5,
      });
      await config.setActiveReviewPass(reviewPassId);

      console.log(
        `seeded default config: model pool '${poolId}', ${prompts.length} prompts, ${categories.length} categories, review pass '${reviewPassId}' (active)`,
      );
    }),
  );
