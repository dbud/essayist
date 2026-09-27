import { partition } from "@std/collections";
import { z } from "zod";
import type { Agent } from "@/agent.ts";
import type { NodeRunner } from "@/flow/types.ts";
import { callStructured } from "@/reviews/call.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import { SerialTasks } from "@/utils/serial.ts";
import type { PinnedVFS } from "@/vfs/pin.ts";
import type { MarkProvenance } from "@/vfs/types.ts";
import { composeCallInput, composeRepairInput } from "./input.ts";

export const MarkProposalSchema = z.object({
  selected_text: z
    .string()
    .describe(
      "The exact text span to mark, copied verbatim from the source text.",
    ),
  comment: z
    .string()
    .describe("Concise, actionable comment attached to the mark."),
  label: z.string().optional().describe("One of the allowed labels."),
  line_hint: z
    .number()
    .int()
    .optional()
    .describe("Line number of the span, when the text appears more than once."),
});

export type MarkProposal = z.infer<typeof MarkProposalSchema>;

export const ProposedMarksSchema = z.object({
  marks: MarkProposalSchema.array(),
});

export type ProposedMarks = z.infer<typeof ProposedMarksSchema>;

export type ProposedMark = MarkProposal;

/**
 * Apply proposed marks through the pinned VFS. Every attempt is reported,
 * including failures with their reason.
 */
export async function applyMarks(
  vfs: PinnedVFS,
  proposed: ProposedMarks,
  allowedLabels: readonly string[],
  provenance: MarkProvenance,
): Promise<MarkAttempt[]> {
  // Sequential on purpose: the marks of a version are a single list under a
  // single KV key, so vfs.mark is a read-modify-write and concurrent
  // applications would lose marks.
  const attempts: MarkAttempt[] = [];
  for (const mark of proposed.marks) {
    attempts.push(await applyMark(vfs, mark, allowedLabels, provenance));
  }
  return attempts;
}

async function applyMark(
  vfs: PinnedVFS,
  mark: ProposedMark,
  allowedLabels: readonly string[],
  provenance: MarkProvenance,
): Promise<MarkAttempt> {
  if (
    mark.label !== undefined &&
    allowedLabels.length > 0 &&
    !allowedLabels.includes(mark.label)
  ) {
    return {
      ...mark,
      marked: false,
      error: `label "${mark.label}" is not allowed; use one of: ${allowedLabels.join(", ")}`,
    };
  }
  const result = await vfs.mark(vfs.path, mark.selected_text, mark.comment, {
    label: mark.label,
    lineHint: mark.line_hint,
    provenance,
  });
  return {
    ...mark,
    ...result,
    error: result.marked ? undefined : "selected text not found",
  };
}

/** A serialized mark applier: marks of a version are a single list in
 * KV, so vfs.mark is a read-modify-write and concurrent
 * applications would lose marks. */
export function createMarkApplier(pinned: PinnedVFS) {
  const tasks = new SerialTasks();
  return (
    marks: MarkProposal[],
    allowedLabels: readonly string[],
    provenance: MarkProvenance,
  ): Promise<MarkAttempt[]> =>
    tasks.add(() => applyMarks(pinned, { marks }, allowedLabels, provenance));
}

export function createMarkProposeRunner(
  agent: Agent,
): NodeRunner<ReviewTypes, "mark.propose"> {
  return {
    async execute({ prompts, pool }, { inputs, artifact, emit }) {
      const result = await callStructured({
        agent,
        onEvent: emit,
        input: composeCallInput(prompts, inputs),
        models: pool.models,
        schema: ProposedMarksSchema,
      });
      return [artifact("mark.proposals", result.output.marks)];
    },
  };
}

/** Re-proposes corrected marks for the failed attempts delivered through
 * its gate. */
export function createMarkRepairRunner(
  agent: Agent,
): NodeRunner<ReviewTypes, "mark.propose.repair"> {
  return {
    async execute({ prompts, pool }, { inputs, artifact, emit }) {
      const failed = inputs.of("mark.failed").flat();
      if (failed.length === 0) {
        // Activated by its gate with nothing to repair; stays idle.
        return [];
      }
      const result = await callStructured({
        agent,
        onEvent: emit,
        input: composeRepairInput(prompts, inputs),
        models: pool.models,
        schema: ProposedMarksSchema,
      });
      return [artifact("mark.proposals", result.output.marks)];
    },
  };
}

export function createMarkApplyRunner(
  apply: (
    marks: MarkProposal[],
    allowedLabels: readonly string[],
    provenance: MarkProvenance,
  ) => Promise<MarkAttempt[]>,
): NodeRunner<ReviewTypes, "mark.apply"> {
  return {
    async execute({ allowedLabels, provenance }, { inputs, artifact, emit }) {
      const attempts = await apply(
        inputs.of("mark.proposals").flat(),
        allowedLabels,
        provenance,
      );
      emit({ type: "applied", attempts });
      const [placed, failed] = partition(attempts, (attempt) => attempt.marked);
      return [
        artifact("mark.placed", placed),
        ...(failed.length > 0 ? [artifact("mark.failed", failed)] : []),
      ];
    },
  };
}
