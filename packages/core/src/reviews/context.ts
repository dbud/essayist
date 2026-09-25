import type { ResolvedStep } from "@/config/types.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import { joinBlocks, joinLines, listOf, section } from "@/utils/text.ts";
import type { Analysis } from "./steps/analyze.ts";

export interface StepRunContext {
  /** Numbered content of the pinned version, in `NNNNNN: line` form. */
  essay: string;
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
    context.essay,
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
    const name =
      context.steps.find((step) => step.step.id === id)?.step.name ?? id;
    return renderAnalysis(name, analysis);
  });
}

// TODO -- when a second artifact shape is needed, turn this renderer and
// AnalysisSchema into named (schema, renderer) profiles selected per step.
function renderAnalysis(name: string, analysis: Analysis): string {
  return joinBlocks(
    joinBlocks(
      section(`Analysis from step "${name}"`),
      joinLines(
        analysis.thesis && `Thesis: ${analysis.thesis}`,
        analysis.audience && `Audience: ${analysis.audience}`,
        listOf("Claims, in order:", analysis.claims, { numbered: true }),
        listOf(
          "Outline:",
          analysis.outline.map(
            (entry) => `line ${entry.first_line}: ${entry.gist}`,
          ),
        ),
        listOf("Strengths:", analysis.strengths),
        listOf("Where a skeptical reader may resist:", analysis.risks),
      ),
    ),
  );
}

function markLine(attempt: MarkAttempt): string {
  const label = attempt.label ? `[${attempt.label}] ` : "";
  return `${label}${JSON.stringify(attempt.selected_text)} ${attempt.comment}`;
}
