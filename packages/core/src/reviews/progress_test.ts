import { assertEquals } from "@std/assert";
import type { FlowEvent, NodeKind } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import type { ReviewProgress } from "./progress.ts";
import { ReviewProgressTracker } from "./progress.ts";

const KIND_OF = new Map<string, NodeKind<ReviewTypes>>([
  ["content", "source"],
  ["analyze", "analyze"],
  ["mechanics.propose", "mark.propose"],
  ["mechanics.apply", "mark.apply"],
  ["mechanics.repair1.gate", "mark.repair.gate"],
  ["mechanics.repair1.propose", "mark.propose.repair"],
  ["synthesize", "synthesize"],
]);

Deno.test("ReviewProgressTracker -- emits initial state on construction", () => {
  const events: ReviewProgress[] = [];
  new ReviewProgressTracker((p) => events.push(p), KIND_OF);

  assertEquals(events, [{ phase: "working", notes: 0 }]);
});

Deno.test("ReviewProgressTracker -- derives node phases and note counts", () => {
  const events: ReviewProgress[] = [];
  const tracker = new ReviewProgressTracker((p) => events.push(p), KIND_OF);

  const sequence: FlowEvent<ReviewTypes>[] = [
    { type: "node_start", nodeId: "analyze" },
    {
      type: "custom",
      nodeId: "analyze",
      event: { type: "prompt", text: "secret" },
    },
    {
      type: "custom",
      nodeId: "analyze",
      event: { type: "output", output: { thesis: "x" } },
    },
    {
      type: "custom",
      nodeId: "analyze",
      event: {
        type: "usage",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          cachedTokens: 0,
          reasoningTokens: 0,
        },
      },
    },
    {
      type: "node_end",
      nodeId: "analyze",
      run: {
        nodeId: "analyze",
        status: "completed",
        startedAt: 1,
        completedAt: 2,
      },
    },
    { type: "node_start", nodeId: "mechanics.propose" },
    {
      type: "custom",
      nodeId: "mechanics.apply",
      event: {
        type: "applied",
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
    },
    { type: "node_start", nodeId: "mechanics.repair1.gate" },
    { type: "node_start", nodeId: "mechanics.repair1.propose" },
    {
      type: "custom",
      nodeId: "mechanics.repair1.apply",
      event: {
        type: "applied",
        attempts: [{ selected_text: "d", comment: "c", marked: true }],
      },
    },
    { type: "node_start", nodeId: "synthesize" },
    { type: "node_start", nodeId: "ghost" },
  ];
  for (const event of sequence) tracker.handle(event);

  assertEquals(events, [
    { phase: "working", notes: 0 },
    { phase: "analyzing", notes: 0 },
    { phase: "marking", notes: 0 },
    { phase: "marking", notes: 2 },
    { phase: "repairing", notes: 2 },
    { phase: "repairing", notes: 2 },
    { phase: "repairing", notes: 3 },
    { phase: "summarizing", notes: 3 },
    // An unmapped node id falls back to the working phase.
    { phase: "working", notes: 3 },
  ]);
});
