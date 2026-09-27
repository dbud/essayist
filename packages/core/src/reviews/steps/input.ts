import type { ResolvedPrompts } from "@/config/types.ts";
import type { Artifact, Artifacts, ArtifactType } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import { joinBlocks, joinLines, listOf, section } from "@/utils/text.ts";
import type { Analysis } from "./analyze.ts";
import type { MarkProposal } from "./mark.ts";

// One renderer per artifact type: how the artifact reads inside a model
// call input. Exhaustive over the vocabulary, so a new artifact type
// cannot reach a prompt without a rendering.
const ARTIFACT_RENDERERS = {
  content: renderContent,
  analysis: renderAnalysis,
  "mark.proposals": renderProposedMarks,
  "mark.placed": renderPlacedMarks,
  "mark.failed": renderFailedMarks,
  summary: renderSummary,
} satisfies {
  [A in ArtifactType<ReviewTypes>]: (
    data: ReviewTypes["artifacts"][A],
  ) => string;
};

function renderArtifact(artifact: Artifact<ReviewTypes>): string {
  const render = ARTIFACT_RENDERERS[artifact.type] as (data: unknown) => string;
  return render(artifact.data);
}

function renderContent(data: string): string {
  return joinBlocks(section("Essay (numbered lines)"), data);
}

function renderSummary(data: string): string {
  return joinBlocks(section("Summary"), data);
}

function renderProposedMarks(data: MarkProposal[]): string {
  return renderAttemptList("Proposed marks", data);
}

function renderPlacedMarks(data: MarkAttempt[]): string {
  return renderAttemptList("Placed marks", data);
}

function renderFailedMarks(data: MarkAttempt[]): string {
  return renderAttemptList("Failed marks", data);
}

function renderAnalysis(analysis: Analysis): string {
  return joinBlocks(
    section("Analysis"),
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
  );
}

function renderAttemptList(
  header: string,
  attempts: readonly {
    selected_text: string;
    comment: string;
    label?: string;
    error?: string;
  }[],
): string {
  return joinBlocks(
    section(header),
    attempts.map((attempt) =>
      joinLines(
        `"${attempt.selected_text}"`,
        attempt.comment,
        ...(attempt.label ? [attempt.label] : []),
        ...(attempt.error ? [`error: ${attempt.error}`] : []),
      ),
    ),
  );
}

/** Build the input of a model call: the unit's prompts followed by the
 * rendered dependency artifacts in dependsOn order. The adapter wires the
 * essay last, so it anchors the prompt. */
export function composeCallInput(
  prompts: ResolvedPrompts,
  inputs: Artifacts<ReviewTypes>,
): string {
  return joinBlocks(
    prompts.system,
    prompts.instructions,
    prompts.directive,
    ...inputs.all.map(renderArtifact),
  );
}

const REPAIR_CONTEXT_LINES = 5;

const REPAIR_PREAMBLE = [
  "Repair the following marks: each one failed to match the essay text.",
  "Return corrected marks for these attempts only, quoting text exactly as it appears in the content below.",
];

/** Build the input of a repair call: system prompt and instructions, then
 * a context window around each failed attempt. The full essay is not
 * included; each window carries its slice of it. */
export function composeRepairInput(
  prompts: ResolvedPrompts,
  inputs: Artifacts<ReviewTypes>,
): string {
  const content = inputs.one("content");
  const failed = inputs.of("mark.failed").flat();
  return joinBlocks(
    prompts.system,
    prompts.instructions,
    REPAIR_PREAMBLE,
    ...failed.map((attempt) =>
      joinBlocks(section("Failed mark"), failedAttemptBody(attempt, content)),
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
