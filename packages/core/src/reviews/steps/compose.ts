import type { Prompts } from "@/reviews/graph.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import { joinBlocks, joinLines, section } from "@/utils/text.ts";

/** Compose a step call prompt from the rendered prompts, artifact
 * sections, and the essay. */
export function composeCallInput(
  prompts: Prompts,
  sections: string[],
  content: string,
): string {
  return joinBlocks(
    prompts.system,
    prompts.instructions,
    prompts.directive,
    ...sections,
    section("Essay (numbered lines)"),
    content,
  );
}

const REPAIR_CONTEXT_LINES = 5;

/** Compose the repair prompt for failed marks. */
export function composeRepairInput(
  prompts: Pick<Prompts, "system" | "instructions">,
  essay: string,
  failed: MarkAttempt[],
): string {
  return joinBlocks(
    prompts.system,
    prompts.instructions,
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
