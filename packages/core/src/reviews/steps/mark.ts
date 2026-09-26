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
import { renderAnalysis } from "./analyze.ts";
import { composeCallInput, composeRepairInput } from "./compose.ts";

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

/** A serialized mark applier: marks of a version are a single list under
 * one KV key, so vfs.mark is a read-modify-write and concurrent
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

/** Proposes marks for a step with a structured call. */
export function createProposeRunner(
  agent: Agent,
): NodeRunner<ReviewTypes, "propose"> {
  return {
    async execute(prompts, { inputs, artifact, emit }) {
      const result = await callStructured({
        agent,
        onEvent: emit,
        input: composeCallInput(
          prompts,
          inputs.of("analysis").map(renderAnalysis),
          inputs.one("content"),
        ),
        models: prompts.models,
        schema: ProposedMarksSchema,
      });
      return [artifact("proposals", result.output.marks)];
    },
  };
}

/** Re-proposes corrected marks for the failed attempts delivered through
 * its gate. */
export function createRepairProposeRunner(
  agent: Agent,
): NodeRunner<ReviewTypes, "repairPropose"> {
  return {
    async execute(prompts, { inputs, artifact, emit }) {
      const result = await callStructured({
        agent,
        onEvent: emit,
        input: composeRepairInput(
          prompts,
          inputs.one("content"),
          inputs.of("failed").flat(),
        ),
        models: prompts.models,
        schema: ProposedMarksSchema,
      });
      return [artifact("proposals", result.output.marks)];
    },
  };
}

/** Applies proposed marks through the pinned VFS. */
export function createApplyRunner(
  apply: (
    marks: MarkProposal[],
    allowedLabels: readonly string[],
    provenance: MarkProvenance,
  ) => Promise<MarkAttempt[]>,
): NodeRunner<ReviewTypes, "apply"> {
  return {
    async execute({ allowedLabels, provenance }, { inputs, artifact, emit }) {
      const attempts = await apply(
        inputs.of("proposals").flat(),
        allowedLabels,
        provenance,
      );
      emit({ type: "applied", attempts });
      const [placed, failed] = partition(attempts, (attempt) => attempt.marked);
      return [
        artifact("placed", placed),
        ...(failed.length > 0 ? [artifact("failed", failed)] : []),
      ];
    },
  };
}
