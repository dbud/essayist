import { assertEquals } from "@std/assert";
import type { ReviewProgress } from "./progress.ts";
import { ReviewProgressTracker } from "./progress.ts";
import type { ReviewTraceEvent } from "./types.ts";

Deno.test("ReviewProgressTracker -- emits initial state on construction", () => {
  const events: ReviewProgress[] = [];
  new ReviewProgressTracker((p) => events.push(p));

  assertEquals(events, [{ phase: "working", notes: 0 }]);
});

Deno.test("ReviewProgressTracker -- derives step phases and note counts", () => {
  const events: ReviewProgress[] = [];
  const tracker = new ReviewProgressTracker((p) => events.push(p));

  const sequence: ReviewTraceEvent[] = [
    {
      type: "step_start",
      stepId: "understand",
      stepName: "Understand",
      kind: "understand",
    },
    { type: "step_input", stepId: "understand", text: "secret" },
    { type: "step_output", stepId: "understand", output: { thesis: "x" } },
    { type: "step_end", stepId: "understand" },
    {
      type: "step_start",
      stepId: "mechanics",
      stepName: "Mechanics",
      kind: "mark",
    },
    {
      type: "marks_applied",
      stepId: "mechanics",
      attempts: [
        { selected_text: "a", comment: "c", marked: true },
        { selected_text: "b", comment: "c", marked: true },
        {
          selected_text: "ghost",
          comment: "c",
          marked: false,
          error: "no match",
        },
      ],
    },
    {
      type: "marks_applied",
      stepId: "mechanics",
      attempts: [{ selected_text: "d", comment: "c", marked: true }],
    },
    { type: "step_repair", stepId: "mechanics", round: 1 },
    { type: "step_end", stepId: "mechanics" },
    {
      type: "step_start",
      stepId: "synthesize",
      stepName: "Synthesize",
      kind: "synthesize",
    },
    {
      type: "usage",
      stepId: "synthesize",
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        cachedTokens: 0,
        reasoningTokens: 0,
      },
    },
  ];
  for (const event of sequence) tracker.handle(event);

  assertEquals(events, [
    { phase: "working", notes: 0 },
    {
      stepId: "understand",
      stepName: "Understand",
      phase: "analyzing",
      notes: 0,
    },
    { stepId: "mechanics", stepName: "Mechanics", phase: "marking", notes: 0 },
    { stepId: "mechanics", stepName: "Mechanics", phase: "marking", notes: 2 },
    { stepId: "mechanics", stepName: "Mechanics", phase: "marking", notes: 3 },
    {
      stepId: "mechanics",
      stepName: "Mechanics",
      phase: "repairing",
      notes: 3,
    },
    {
      stepId: "synthesize",
      stepName: "Synthesize",
      phase: "summarizing",
      notes: 3,
    },
  ]);
});
