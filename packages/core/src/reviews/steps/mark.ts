import { partition } from "@std/collections";
import { Effect, Schema } from "effect";

import type { Category } from "#/config/types.ts";
import type { FileMissingError } from "#/files/types.ts";
import type { NodeRunner } from "#/flow/types.ts";
import { Marks } from "#/marks/service.ts";
import type { ModelClient } from "#/model/service.ts";
import { callStructured } from "#/reviews/call.ts";
import type { ReviewTypes } from "#/reviews/graph.ts";
import type { MarkAttempt, PlacedMarkAttempt } from "#/reviews/types.ts";
import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { composeCallInput, composeRepairInput } from "./input.ts";

export const MarkProposalSchema = Schema.Struct({
  selectedText: Schema.String.annotate({
    description: "The exact text span to mark, copied verbatim from the source text.",
    examples: ["the second sentence of paragraph three, exactly as written"],
  }),
  comment: Schema.String.annotate({
    description: "Concise, actionable comment attached to the mark.",
    examples: ["This restates the thesis instead of advancing it."],
  }),
  label: Schema.String.annotate({
    description: "Which aspect this mark is about. Use the allowed labels.",
  }),
  lineHint: Schema.optionalKey(
    Schema.Int.annotate({
      description: "Line number of the span, when the text appears more than once.",
    }),
  ),
});

export type MarkProposal = Schema.Schema.Type<typeof MarkProposalSchema>;

export const ProposedMarksSchema = Schema.Struct({
  marks: Schema.Array(MarkProposalSchema).annotate({
    examples: [
      [
        {
          selectedText: "the exact span from the essay",
          comment: "what is wrong with it",
          label: "grammar",
        },
      ],
    ],
  }),
});

/** The version an apply node marks, the run that owns the marks, and the categories of the pass. */
export interface MarkContext {
  fileId: string;
  versionId: string;
  runId: string;
  /** A proposal names its category by label; any label goes when there are none. */
  categories: ReadonlyArray<Pick<Category, "id" | "label">>;
}

/** Apply proposals as marks, one attempt per proposal. Every attempt is reported, a failed one
 * with its reason for the repair round. */
export function applyProposedMarks(
  proposals: readonly MarkProposal[],
  { fileId, versionId, runId, categories }: MarkContext,
): Effect.Effect<MarkAttempt[], FileMissingError, Marks | WorkspaceId> {
  return Effect.gen(function* () {
    const marks = yield* Marks;
    const attempts: MarkAttempt[] = [];
    for (const proposal of proposals) {
      const category = categories.find(({ label }) => label === proposal.label);
      if (categories.length > 0 && category === undefined) {
        const allowed = categories.map(({ label }) => label).join(", ");
        attempts.push({
          ...proposal,
          marked: false,
          error: `label "${proposal.label}" is not allowed; use one of: ${allowed}`,
        });
        continue;
      }
      const attempt = yield* marks
        .mark({
          fileId,
          versionId,
          runId,
          selectedText: proposal.selectedText,
          comment: proposal.comment,
          categoryId: category?.id,
          lineHint: proposal.lineHint,
        })
        .pipe(
          Effect.map((mark): MarkAttempt => ({ ...proposal, marked: true, markId: mark.id })),
          Effect.catchTag("MarkTextNotFoundError", (error) =>
            Effect.succeed<MarkAttempt>({ ...proposal, marked: false, error: error.message }),
          ),
        );
      attempts.push(attempt);
    }
    return attempts;
  });
}

export const markApplyRunner: NodeRunner<ReviewTypes, "mark.apply", Marks | WorkspaceId> = {
  execute: (context, { inputs, artifact, emit }) =>
    Effect.gen(function* () {
      const attempts = yield* applyProposedMarks(inputs.of("mark.proposals").flat(), context);
      yield* emit({ type: "applied", attempts });
      const [placed, failed] = partition(
        attempts,
        (attempt): attempt is PlacedMarkAttempt => attempt.marked,
      );
      return [
        artifact("mark.placed", placed),
        ...(failed.length > 0 ? [artifact("mark.failed", failed)] : []),
      ];
    }),
};

export const markProposeRunner: NodeRunner<ReviewTypes, "mark.propose", ModelClient> = {
  execute: ({ prompts, pool }, { inputs, artifact, emit }) =>
    Effect.gen(function* () {
      const result = yield* callStructured({
        onEvent: emit,
        input: composeCallInput(prompts, inputs),
        models: pool.models,
        schema: ProposedMarksSchema,
        includeExample: true,
      });
      return [artifact("mark.proposals", result.marks)];
    }),
};

/** Re-proposes corrected marks for the failed attempts delivered through
 * its gate. */
export const markRepairRunner: NodeRunner<ReviewTypes, "mark.propose.repair", ModelClient> = {
  execute: ({ prompts, pool }, { inputs, artifact, emit }) =>
    Effect.gen(function* () {
      const failed = inputs.of("mark.failed").flat();
      if (failed.length === 0) {
        // Activated by its gate with nothing to repair; stays idle.
        return [];
      }
      const result = yield* callStructured({
        onEvent: emit,
        input: composeRepairInput(prompts, inputs),
        models: pool.models,
        schema: ProposedMarksSchema,
        includeExample: true,
      });
      return [artifact("mark.proposals", result.marks)];
    }),
};
