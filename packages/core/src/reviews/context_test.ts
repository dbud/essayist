import { assertEquals, assertThrows } from "@std/assert";
import type { ResolvedStep } from "@/config/types.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import { composeStepInput, type StepRunContext } from "./context.ts";
import type { Analysis } from "./steps/analyze.ts";

function resolved(
  step: ResolvedStep["step"],
  overrides?: Partial<ResolvedStep>,
): ResolvedStep {
  return {
    step,
    modelRefs: ["m/a"],
    apiKeyEnvKey: "KEY",
    systemPrompt: "You are an editor.",
    directive: `Review the essay.`,
    instructions: "",
    categories: [],
    allowedLabels: [],
    ...overrides,
  };
}

const analysis: Analysis = {
  thesis: "Drafts are raw material.",
  claims: ["First drafts exist to be argued with"],
  outline: [{ first_line: 3, gist: "Opening claim" }],
  strengths: ["Concrete examples"],
  risks: ["Overgeneralized ending"],
};

const attempt: MarkAttempt = {
  selected_text: "a comma splice",
  comment: "Split the sentence.",
  label: "grammar",
  marked: true,
};

const unlabeledAttempt: MarkAttempt = {
  selected_text: "the hedging qualifier",
  comment: "Cut the qualifier.",
  marked: true,
};

function context(overrides?: Partial<StepRunContext>): StepRunContext {
  return {
    content: "     1: first line\n     2: second line",
    artifacts: new Map([["analyze", analysis]]),
    priorMarks: [attempt, unlabeledAttempt],
    steps: [
      resolved({
        id: "analyze",
        name: "Analyze",
        kind: "analyze",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
      }),
    ],
    ...overrides,
  };
}

Deno.test("composeStepInput -- analyze steps get prompts and essay only", () => {
  const step = resolved({
    id: "analyze",
    name: "Analyze",
    kind: "analyze",
    systemPromptKey: "sys",
    directivePromptKey: "dir",
  });

  const input = composeStepInput(step, context());

  assertEquals(
    input,
    [
      "You are an editor.",
      "Review the essay.",
      "## Essay (numbered lines)\n\n     1: first line\n     2: second line",
    ].join("\n\n"),
  );
});

Deno.test("composeStepInput -- mark steps include referenced artifacts and prior marks", () => {
  const step = resolved(
    {
      id: "argument",
      name: "Argument",
      kind: "mark",
      systemPromptKey: "sys",
      directivePromptKey: "dir",
      artifactsFromStepIds: ["analyze"],
    },
    {
      instructions: "Quote exact spans.",
    },
  );

  const input = composeStepInput(step, context());

  assertEquals(
    input.startsWith(
      "You are an editor.\n\nQuote exact spans.\n\nReview the essay.\n\n## Analysis",
    ),
    true,
  );
  assertEquals(input.includes('## Analysis from step "Analyze"'), true);
  assertEquals(input.includes("Thesis: Drafts are raw material."), true);
  assertEquals(input.includes("- line 3: Opening claim"), true);
  assertEquals(input.includes("## Already flagged"), true);
  assertEquals(
    input.includes('[grammar] "a comma splice" Split the sentence.'),
    true,
  );
  assertEquals(
    input.includes('"the hedging qualifier" Cut the qualifier.'),
    true,
  );
  const order = [
    input.indexOf("## Analysis"),
    input.indexOf("## Already flagged"),
    input.indexOf("## Essay (numbered lines)"),
  ];
  assertEquals(
    order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])),
    true,
  );
});

Deno.test("composeStepInput -- synthesize steps render placed marks", () => {
  const step = resolved({
    id: "synthesize",
    name: "Synthesize",
    kind: "synthesize",
    systemPromptKey: "sys",
    directivePromptKey: "dir",
  });

  const input = composeStepInput(step, context());

  assertEquals(input.includes("## Marks placed"), true);
  assertEquals(input.includes("## Already flagged"), false);
});

Deno.test("composeStepInput -- empty prompts and sections are skipped", () => {
  const step = resolved(
    {
      id: "analyze",
      name: "Analyze",
      kind: "analyze",
      systemPromptKey: "sys",
      directivePromptKey: "dir",
    },
    { systemPrompt: "", directive: "", instructions: "" },
  );

  const input = composeStepInput(
    step,
    context({ artifacts: new Map(), content: "     1: only line" }),
  );

  assertEquals(input, "## Essay (numbered lines)\n\n     1: only line");
});

Deno.test("composeStepInput -- throws on a missing referenced artifact", () => {
  const step = resolved({
    id: "argument",
    name: "Argument",
    kind: "mark",
    systemPromptKey: "sys",
    directivePromptKey: "dir",
    artifactsFromStepIds: ["ghost"],
  });

  assertThrows(
    () => composeStepInput(step, context()),
    Error,
    'Missing artifact for step "ghost"',
  );
});
