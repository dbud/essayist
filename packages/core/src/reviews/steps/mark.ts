import { partition } from "@std/collections";
import { Effect, Schema } from "effect";
import type { NodeRunner } from "@/flow/types.ts";
import { Marks } from "@/marks/service.ts";
import type { MarkProvenance } from "@/marks/types.ts";
import type { ModelClient } from "@/model/service.ts";
import type {
  ConcurrentModificationError,
  PersistenceError,
} from "@/persistence/mod.ts";
import { callStructured } from "@/reviews/call.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import type { WorkspaceId } from "@/workspace/WorkspaceId.ts";
import { composeCallInput, composeRepairInput } from "./input.ts";

export const MarkProposalSchema = Schema.Struct({
  selected_text: Schema.String.annotate({
    description:
      "The exact text span to mark, copied verbatim from the source text.",
    examples: ["the second sentence of paragraph three, exactly as written"],
  }),
  comment: Schema.String.annotate({
    description: "Concise, actionable comment attached to the mark.",
    examples: ["This restates the thesis instead of advancing it."],
  }),
  label: Schema.String.annotate({
    description: "Which aspect this mark is about. Use the allowed labels.",
  }),
  line_hint: Schema.optionalKey(
    Schema.Int.annotate({
      description:
        "Line number of the span, when the text appears more than once.",
    }),
  ),
});

export type MarkProposal = Schema.Schema.Type<typeof MarkProposalSchema>;

export const ProposedMarksSchema = Schema.Struct({
  marks: Schema.Array(MarkProposalSchema).annotate({
    examples: [
      [
        {
          selected_text: "the exact span from the essay",
          comment: "what is wrong with it",
          label: "grammar",
        },
      ],
    ],
  }),
});

export interface MarkPin {
  path: string;
  versionId: string;
}

/** Apply proposals as marks on one pinned version, one proposal per
 * attempt: every attempt is reported, including failures with their
 * reason. Each mark appends to the version's single mark list through a
 * checked write, retried on concurrent modification. */
export function applyProposedMarks(
  proposals: readonly MarkProposal[],
  allowedLabels: readonly string[],
  pin: MarkPin,
  provenance: MarkProvenance,
): Effect.Effect<
  MarkAttempt[],
  PersistenceError | ConcurrentModificationError,
  Marks | WorkspaceId
> {
  return Effect.gen(function* () {
    const marks = yield* Marks;
    const attempts: MarkAttempt[] = [];
    for (const proposal of proposals) {
      if (allowedLabels.length > 0 && !allowedLabels.includes(proposal.label)) {
        attempts.push({
          ...proposal,
          marked: false,
          error: `label "${proposal.label}" is not allowed; use one of: ${allowedLabels.join(", ")}`,
        });
        continue;
      }
      const result = yield* marks.mark(
        pin.path,
        proposal.selected_text,
        proposal.comment,
        {
          label: proposal.label,
          lineHint: proposal.line_hint,
          provenance,
          versionId: pin.versionId,
        },
      );
      attempts.push({
        ...proposal,
        ...result,
        error: result.marked ? undefined : "selected text not found",
      });
    }
    return attempts;
  });
}

export const markApplyRunner: NodeRunner<
  ReviewTypes,
  "mark.apply",
  Marks | WorkspaceId
> = {
  execute: (
    { path, versionId, allowedLabels, provenance },
    { inputs, artifact, emit },
  ) =>
    Effect.gen(function* () {
      const attempts = yield* applyProposedMarks(
        inputs.of("mark.proposals").flat(),
        allowedLabels,
        { path, versionId },
        provenance,
      );
      yield* emit({ type: "applied", attempts });
      const [placed, failed] = partition(attempts, (attempt) => attempt.marked);
      return [
        artifact("mark.placed", placed),
        ...(failed.length > 0 ? [artifact("mark.failed", failed)] : []),
      ];
    }),
};

export const markProposeRunner: NodeRunner<
  ReviewTypes,
  "mark.propose",
  ModelClient
> = {
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
export const markRepairRunner: NodeRunner<
  ReviewTypes,
  "mark.propose.repair",
  ModelClient
> = {
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
