import { z } from "zod";
import type { ResolvedStep } from "@/config/types.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import { joinBlocks, joinLines, section } from "@/utils/text.ts";
import type { PinnedVFS } from "@/vfs/pin.ts";
import type { MarkProvenance } from "@/vfs/types.ts";

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
  // Sequential on purpose: a version's marks are one list under one KV key,
  // so vfs.mark is a read-modify-write and concurrent marks would drop marks.
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

const REPAIR_CONTEXT_LINES = 5;

/** Build the repair prompt for failed marks. */
export function composeRepairInput(
  resolved: ResolvedStep,
  essay: string,
  failed: MarkAttempt[],
): string {
  return joinBlocks(
    resolved.systemPrompt,
    resolved.instructions,
    "Repair the following marks: each one failed to match the essay text.",
    "Return corrected marks for these attempts only, quoting text exactly as it appears in the content below.",
    ...failed.map((attempt) =>
      joinBlocks(section("Failed mark"), failedAttemptBody(attempt, essay)),
    ),
  );
}

function failedAttemptBody(attempt: MarkAttempt, essay: string): string {
  const lines = essay.split("\n");
  const hint = attempt.line_hint;
  const from = Math.max(1, (hint ?? 1) - REPAIR_CONTEXT_LINES);
  const to = Math.min(
    lines.length,
    (hint ?? lines.length) + REPAIR_CONTEXT_LINES,
  );
  return joinLines(
    `Attempted span: "${attempt.selected_text}"`,
    `Comment: ${attempt.comment}`,
    `Error: ${attempt.error}`,
    "",
    hint ? `Content around line ${hint}:` : "Content:",
    lines.slice(from - 1, to),
  );
}
