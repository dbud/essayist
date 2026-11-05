import { assert, assertEquals } from "@std/assert";
import { Effect } from "effect";
import { test } from "vitest";

import { type ModelCallRecord } from "#/model/service.ts";
import { createStubModelClient } from "#/model/stub.ts";
import { AnalysisSchema } from "#/reviews/steps/analyze.ts";
import { ProposedMarksSchema } from "#/reviews/steps/mark.ts";
import { StepSummarySchema } from "#/reviews/steps/synthesize.ts";

const ESSAY = [
  "On Writing Roughly",
  "",
  "A first draft is permission to be bad.",
  "The blank page does not judge; it only waits,",
  "and what it records can always be changed.",
  "",
  "Revision is where the writing actually happens.",
  "The draft tells you what you meant to say;",
  "the rewrite decides what you do say.",
  "",
  "Read the finished piece aloud before you keep it.",
  "The ear catches what the eye forgives,",
  "and a sentence that stumbles on the tongue",
  "will stumble again in the reader's mind.",
].join("\n");

function numbered(content: string): string {
  return content
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(6)}: ${line}`)
    .join("\n");
}

function proposePrompt(): string {
  return [
    "You are an editor.",
    "## Allowed labels",
    "",
    "- grammar: Grammar, mechanics, usage",
    "- structure: Organization and flow",
    "",
    "## Essay (numbered lines)",
    "",
    numbered(ESSAY),
  ].join("\n");
}

test("proposals quote real spans of the essay and use allowed labels", async () => {
  const client = createStubModelClient();
  const result = await Effect.runPromise(
    client.callModelStructured(proposePrompt(), ProposedMarksSchema, ["stub"]),
  );
  assertEquals(result.marks.length, 2);
  assertEquals(
    result.marks.map((mark) => mark.label),
    ["grammar", "structure"],
  );
  assertEquals(result.marks[0].selected_text, "On Writing Roughly");
  assertEquals(result.marks[1].selected_text, "A first draft is permission to be bad.");
  for (const mark of result.marks) {
    assert(mark.line_hint !== undefined);
  }
});

test("faulty proposals quote a ghost span first", async () => {
  const client = createStubModelClient({ faultyProposals: 1 });
  const result = await Effect.runPromise(
    client.callModelStructured(proposePrompt(), ProposedMarksSchema, ["stub"]),
  );
  assertEquals(result.marks[0].selected_text, "ghost span 1");
  assertEquals(result.marks[1].selected_text, "A first draft is permission to be bad.");
});

test("a prompt without essay content proposes nothing", async () => {
  const client = createStubModelClient();
  const result = await Effect.runPromise(
    client.callModelStructured("You are an editor.", ProposedMarksSchema, ["stub"]),
  );
  assertEquals(result.marks, []);
});

test("repairs re-quote from the failed window", async () => {
  const window = numbered(ESSAY).split("\n").slice(6, 14).join("\n");
  const client = createStubModelClient();
  const input = [
    "You are an editor.",
    "## Allowed labels",
    "",
    "- grammar: Grammar, mechanics, usage",
    "",
    "Repair the following marks: each one failed to match the essay text.",
    "Return corrected marks for these attempts only, quoting text exactly as it appears in the content below.",
    "## Failed mark",
    'Attempted span: "ghost span 1"',
    "Comment: Check this sentence for mechanical faults.",
    "Error: selected text not found",
    "",
    "Content around line 12:",
    window,
    "",
    "## Failed mark",
    'Attempted span: "The draft tells you what you meant to say;"',
    "Comment: Consider how this passage connects to the next.",
    'Error: label "wrong" is not allowed; use one of: grammar',
    "",
    "Content around line 8:",
    window,
  ].join("\n");
  const result = await Effect.runPromise(
    client.callModelStructured(input, ProposedMarksSchema, ["stub"]),
  );
  assertEquals(result.marks.length, 2);
  assertEquals(result.marks[0].selected_text, "The ear catches what the eye forgives,");
  assertEquals(result.marks[0].label, "grammar");
  assertEquals(result.marks[0].line_hint, 12);
  // The attempted span already matches the text, so the repair keeps it.
  assertEquals(result.marks[1].selected_text, "The draft tells you what you meant to say;");
  assertEquals(result.marks[1].line_hint, 8);
});

test("analysis bullets do not leak in as allowed labels", async () => {
  const client = createStubModelClient();
  const input = [
    "You are an editor.",
    "## Allowed labels",
    "",
    "- structure: Organization and flow",
    "",
    "## Analysis",
    "",
    "Thesis: The piece opens.",
    "## Outline:",
    "",
    "- lines 1-11: Carries lines 1-11 of the piece.",
    "- The opening at line 1 sets the voice cleanly.",
    "",
    "## Essay (numbered lines)",
    "",
    numbered("# On Drafts\n\nBody line one. It carries the whole paragraph on its back."),
  ].join("\n");
  const result = await Effect.runPromise(
    client.callModelStructured(input, ProposedMarksSchema, ["stub"]),
  );
  assertEquals(result.marks.length, 1);
  assertEquals(result.marks[0].label, "structure");
  // Headings do not carry prose; the span lands on the paragraph line.
  assertEquals(result.marks[0].selected_text, "Body line one. It carries the whole paragraph");
});

test("analysis reflects the essay's line numbers", async () => {
  const client = createStubModelClient();
  const result = await Effect.runPromise(
    client.callModelStructured(`## Essay (numbered lines)\n\n${numbered(ESSAY)}`, AnalysisSchema, [
      "stub",
    ]),
  );
  assertEquals(result.outline.length, 3);
  assertEquals(result.outline[0].first_line, 1);
  assertEquals(result.outline[2].last_line, 14);
  for (const section of result.outline) {
    assertEquals(section.first_line <= section.last_line, true);
  }
  assert(result.thesis !== undefined);
});

test("summary is grounded in the placed marks", async () => {
  const client = createStubModelClient();
  const input = [
    "## Placed marks",
    '"A first draft is permission to be bad."',
    "Check this sentence for mechanical faults.",
    "grammar",
    "",
    "## Placed marks",
    '"Revision is where the writing actually happens."',
    "Consider how this passage connects to the next.",
    "structure",
  ].join("\n");
  const result = await Effect.runPromise(
    client.callModelStructured(input, StepSummarySchema, ["stub"]),
  );
  assertEquals(result.summary.includes("2 mark(s) placed"), true);
  assertEquals(result.summary.includes("grammar"), true);
  assertEquals(result.summary.includes("structure"), true);
});

test("the delay is reported as the call duration", async () => {
  const calls: ModelCallRecord[] = [];
  const client = createStubModelClient({ delayMs: 5 });
  await Effect.runPromise(
    client.callModelStructured(proposePrompt(), ProposedMarksSchema, ["stub"], {
      onModelCall: (call) => Effect.sync(() => calls.push(call)),
    }),
  );
  assertEquals(calls.length, 1);
  assertEquals(calls[0].model, "stub");
  assertEquals(calls[0].durationMs, 5);
});
