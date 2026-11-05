/**
 * The stub agent-call layer: answers every structured call deterministically from the prompt
 * itself, so the review machinery runs end to end without a model provider. Marks quote real spans
 * of the essay, the analysis reflects the actual line numbers, and the summary is grounded in the
 * placed marks the prompt carries. Delays and deliberately faulty proposals let a dev exercise slow
 * runs, eviction, and the repair round.
 */

import { Effect, Result, Schema } from "effect";

import { type ModelCallRecord, ModelClient, StructuredParseError } from "#/model/service.ts";

export interface StubModelOptions {
  /** Simulated thinking time per model call, reported as the call's duration. */
  readonly delayMs?: number;
  /** Proposals per call that quote a nonexistent span, so the repair round runs. */
  readonly faultyProposals?: number;
}

const STUB_MODEL = "stub";

/** Words quoted per proposed span; a word-boundary prefix stays an exact substring. */
const SPAN_WORDS = 8;

const COMMENTS: Record<string, string> = {
  grammar: "Check this sentence for mechanical faults.",
  structure: "Consider how this passage connects to the next.",
  thesis: "Does this state the argument plainly?",
  evidence: "This claim could use more support.",
};

interface EssayLine {
  readonly n: number;
  readonly text: string;
}

/** The text of every section under the header, split on repeats of the same header. */
function sections(input: string, header: string): string[] {
  const out: string[] = [];
  let at = input.indexOf(header);
  while (at !== -1) {
    const next = input.indexOf(`\n${header}`, at + header.length);
    out.push(input.slice(at + header.length, next === -1 ? input.length : next));
    at = next === -1 ? -1 : input.indexOf(header, next);
  }
  return out;
}

/** The essay's raw lines, recovered from the numbered content section. */
function essayLines(input: string): EssayLine[] {
  const lines: EssayLine[] = [];
  for (const sectionText of sections(input, "## Essay (numbered lines)")) {
    for (const line of sectionText.split("\n")) {
      const match = /^ *(\d+): (.*)$/.exec(line);
      if (match) lines.push({ n: Number(match[1]), text: match[2] });
    }
  }
  return lines;
}

/** The allowed mark labels from the categories section, up to the next section header. */
function allowedLabels(input: string): string[] {
  const header = "## Allowed labels";
  const at = input.indexOf(header);
  if (at === -1) return [];
  const rest = input.slice(at + header.length);
  const next = rest.indexOf("\n## ");
  const labels: string[] = [];
  for (const line of (next === -1 ? rest : rest.slice(0, next)).split("\n")) {
    const match = /^- ([^:]+?)(?::|$)/.exec(line.trim());
    if (match) labels.push(match[1].trim());
  }
  return labels;
}

interface ParsedAttempt {
  readonly selectedText: string;
  readonly comment: string;
  readonly label?: string;
}

/** The mark blocks across every placed-marks section: a quoted span, its comment, and label. */
function placedMarks(input: string): ParsedAttempt[] {
  const attempts: ParsedAttempt[] = [];
  for (const sectionText of sections(input, "## Placed marks")) {
    const lines = sectionText.split("\n").map((line) => line.trim());
    for (let i = 0; i < lines.length; i++) {
      const span = /^"(.+)"$/.exec(lines[i]);
      if (!span) continue;
      const comment = (lines[i + 1] ?? "").trim();
      const next = (lines[i + 2] ?? "").trim();
      const labeled = next !== "" && !next.startsWith('"') && !next.startsWith("error:");
      attempts.push({
        selectedText: span[1],
        comment,
        ...(labeled && { label: next }),
      });
    }
  }
  return attempts;
}

interface WindowLine {
  readonly n: number | undefined;
  readonly text: string;
}

interface FailedMark {
  readonly attempted: string;
  readonly hint: number | undefined;
  readonly window: WindowLine[];
}

/** Repair windows carry the essay as numbered lines; raw lines pass through unnumbered. */
function windowLines(raw: string[]): WindowLine[] {
  return raw.map((line) => {
    const match = /^ *(\d+): (.*)$/.exec(line);
    return match === null ? { n: undefined, text: line } : { n: Number(match[1]), text: match[2] };
  });
}

/** The failed-mark repair blocks: the attempted span and the raw content window under it. */
function failedMarks(input: string): FailedMark[] {
  return sections(input, "## Failed mark").map((sectionText) => {
    const lines = sectionText.split("\n");
    let attempted = "";
    let hint: number | undefined;
    let window: WindowLine[] = [];
    for (let i = 0; i < lines.length; i++) {
      const span = /Attempted span: "(.+)"$/.exec(lines[i]);
      if (span) attempted = span[1];
      const marker = /^Content(?: around line (\d+))?:$/.exec(lines[i].trim());
      if (marker) {
        hint = marker[1] === undefined ? undefined : Number(marker[1]);
        window = windowLines(lines.slice(i + 1));
        break;
      }
    }
    return { attempted, hint, window };
  });
}

/** The first words of the text, so the span is an exact substring of its line. */
function spanOf(text: string, words = SPAN_WORDS): string {
  return text.trim().split(/\s+/).slice(0, words).join(" ");
}

/** The essay's lines carrying prose, skipping markdown headings. */
function contentLines(input: string): EssayLine[] {
  const lines = essayLines(input).filter((line) => line.text.trim() !== "");
  const prose = lines.filter((line) => !line.text.trimStart().startsWith("#"));
  return prose.length > 0 ? prose : lines;
}

function proposeMarks(input: string, faulty: number): unknown {
  const prose = contentLines(input);
  const labels = allowedLabels(input);
  if (prose.length === 0 || labels.length === 0) return { marks: [] };
  return {
    marks: labels.map((label, i) => {
      const line = prose[i % prose.length];
      return {
        selected_text: i < faulty ? `ghost span ${i + 1}` : spanOf(line.text),
        comment: COMMENTS[label] ?? "Stub mark on this span.",
        label,
        line_hint: line.n,
      };
    }),
  };
}

function repairMarks(input: string): unknown {
  const label = allowedLabels(input)[0] ?? "grammar";
  return {
    marks: failedMarks(input).map((failed) => {
      // A label fix suffices when the attempted span already matches the text.
      let selectedText = failed.attempted;
      if (!failed.window.some((line) => line.text.includes(failed.attempted))) {
        const hintLine =
          failed.hint === undefined
            ? undefined
            : failed.window.find((line) => line.n === failed.hint && line.text.trim() !== "");
        const line = hintLine ?? failed.window.find((candidate) => candidate.text.trim() !== "");
        if (line !== undefined) selectedText = spanOf(line.text);
      }
      return {
        selected_text: selectedText,
        comment: "Stub repair: re-quoted from the surrounding content.",
        label,
        ...(failed.hint !== undefined && { line_hint: failed.hint }),
      };
    }),
  };
}

function analysisOf(input: string): unknown {
  const filled = essayLines(input).filter((line) => line.text.trim() !== "");
  if (filled.length === 0) return { claims: [], outline: [], strengths: [], risks: [] };
  const prose = filled.filter((line) => !line.text.trimStart().startsWith("#"));
  const quoted = prose.length > 0 ? prose : filled;
  const first = quoted[0];
  const last = quoted[quoted.length - 1];
  const chunkCount = Math.min(3, filled.length);
  const size = Math.ceil(filled.length / chunkCount);
  const outline = Array.from({ length: chunkCount }, (_, i) => {
    const chunk = filled.slice(i * size, (i + 1) * size);
    const from = chunk[0].n;
    const to = chunk[chunk.length - 1].n;
    return { first_line: from, last_line: to, gist: `Carries lines ${from}-${to} of the piece.` };
  });
  return {
    thesis: `The piece opens on "${spanOf(first.text, 12)}" and builds from there.`,
    audience: "General readers of the draft.",
    claims: [`It opens with "${spanOf(first.text)}".`, `It closes on "${spanOf(last.text)}".`],
    outline,
    strengths: [`The opening at line ${first.n} sets the voice cleanly.`],
    risks: [`A skeptical reader may want more support by line ${last.n}.`],
  };
}

function summaryOf(input: string): unknown {
  const placed = placedMarks(input);
  if (placed.length === 0) {
    return { summary: "Stub summary: no marks were placed this run." };
  }
  const labels = [
    ...new Set(placed.map((mark) => mark.label).filter((label) => label !== undefined)),
  ];
  return {
    summary: `Stub summary: ${placed.length} mark(s) placed${
      labels.length > 0 ? ` (${labels.join(", ")})` : ""
    }. First note: "${placed[0].comment}"`,
  };
}

function stubOutputOf(schema: Schema.Constraint, input: string, faulty: number): unknown {
  const ast = schema.ast;
  if (ast._tag !== "Objects") return undefined;
  const fields = new Set(ast.propertySignatures.map((property) => property.name as string));
  if (fields.has("marks")) {
    return input.includes("Repair the following marks")
      ? repairMarks(input)
      : proposeMarks(input, faulty);
  }
  if (fields.has("summary")) return summaryOf(input);
  return analysisOf(input);
}

export function createStubModelClient(options: StubModelOptions = {}) {
  const delayMs = options.delayMs ?? 0;
  const faultyProposals = options.faultyProposals ?? 0;
  return ModelClient.of({
    callModelStructured: (input, schema, _models, callOptions) =>
      Effect.gen(function* () {
        if (callOptions?.onPrompt) yield* callOptions.onPrompt(input);
        if (delayMs > 0) yield* Effect.sleep(delayMs);
        const call: ModelCallRecord = { model: STUB_MODEL, durationMs: delayMs };
        if (callOptions?.onModelCall) yield* callOptions.onModelCall(call);
        const reply = stubOutputOf(schema, input, faultyProposals);
        const parsed = Schema.decodeUnknownResult(schema)(reply);
        if (Result.isFailure(parsed)) {
          return yield* Effect.fail(
            new StructuredParseError({
              raw: JSON.stringify(reply),
              detail: parsed.failure.message,
            }),
          );
        }
        return parsed.success;
      }),
  });
}
