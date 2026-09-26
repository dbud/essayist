import type { ResolvedStep } from "@/config/types.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import { joinBlocks, listOf, section } from "@/utils/text.ts";
import type { Analysis } from "./steps/analyze.ts";
import { renderAnalysis } from "./steps/analyze.ts";

export interface StepRunContext {
  /** Numbered content of the pinned version, in `NNNNNN: line` form. */
  content: string;
  /** Artifacts from completed analysis steps, keyed by step id. */
  artifacts: Map<string, Analysis>;
  /** Marks placed by earlier mark steps in this run. */
  priorMarks: MarkAttempt[];
  /** Steps of the pass, used to name referenced steps. */
  steps: ResolvedStep[];
}

/** Build the full prompt for a review step. */
export function composeStepInput(
  resolved: ResolvedStep,
  context: StepRunContext,
): string {
  const { kind } = resolved.step;
  const marks = context.priorMarks;
  return joinBlocks(
    resolved.systemPrompt,
    resolved.instructions,
    resolved.directive,
    ...artifactSections(resolved, context),
    kind === "mark" &&
      marks.length > 0 &&
      listOf(section("Already flagged"), marks.map(markLine)),
    kind === "synthesize" &&
      marks.length > 0 &&
      listOf(section("Marks placed"), marks.map(markLine)),
    section("Essay (numbered lines)"),
    context.content,
  );
}

function artifactSections(
  resolved: ResolvedStep,
  context: StepRunContext,
): string[] {
  return (resolved.step.artifactsFromStepIds ?? []).map((id) => {
    const analysis = context.artifacts.get(id);
    if (!analysis) {
      throw new Error(`Missing artifact for step "${id}"`);
    }
    return renderAnalysis(analysis);
  });
}

function markLine(attempt: MarkAttempt): string {
  const label = attempt.label ? `[${attempt.label}] ` : "";
  return `${label}${JSON.stringify(attempt.selected_text)} ${attempt.comment}`;
}
