import { assertEquals } from "@std/assert";
import type { ReviewProgress } from "./progress.ts";
import { ReviewProgressTracker } from "./progress.ts";
import type { ReviewTraceEvent } from "./types.ts";

Deno.test("ReviewProgressTracker -- emits initial state on construction", () => {
  const events: ReviewProgress[] = [];
  new ReviewProgressTracker((p) => events.push(p));

  assertEquals(events, [{ phase: "working", round: 0, notes: 0 }]);
});

Deno.test("ReviewProgressTracker -- derives phases and note counts", () => {
  const events: ReviewProgress[] = [];
  const tracker = new ReviewProgressTracker((p) => events.push(p));

  const sequence: ReviewTraceEvent[] = [
    { type: "round_start", round: 0 },
    { type: "reasoning", round: 0, text: "secret thoughts" },
    { type: "tool_call", round: 0, callId: "c1", name: "read_file", args: {} },
    {
      type: "tool_output",
      round: 0,
      callId: "c1",
      output: { content: "the whole essay" },
    },
    { type: "round_end", round: 0 },
    { type: "round_start", round: 1 },
    { type: "tool_call", round: 1, callId: "c2", name: "mark", args: {} },
    {
      type: "tool_output",
      round: 1,
      callId: "c2",
      output: { results: [{ marked: true }, { marked: false }] },
    },
    { type: "round_start", round: 2 },
    { type: "message", round: 2, text: "final summary words" },
  ];
  for (const event of sequence) tracker.handle(event);

  assertEquals(events, [
    { phase: "working", round: 0, notes: 0 },
    { phase: "reading", round: 0, notes: 0 },
    { phase: "reading", round: 1, notes: 0 },
    { phase: "annotating", round: 1, notes: 0 },
    { phase: "annotating", round: 1, notes: 1 },
    { phase: "annotating", round: 2, notes: 1 },
    { phase: "summarizing", round: 2, notes: 1 },
  ]);
});

Deno.test("ReviewProgressTracker -- truncated mark output adds no notes", () => {
  const events: ReviewProgress[] = [];
  const tracker = new ReviewProgressTracker((p) => events.push(p));

  tracker.handle({
    type: "tool_output",
    round: 0,
    callId: "c1",
    output: '{"results": truncated',
    truncated: true,
  });

  assertEquals(events.length, 1);
  assertEquals(events[0].notes, 0);
});

Deno.test("ReviewProgressTracker -- unknown tools stay in working phase", () => {
  const events: ReviewProgress[] = [];
  const tracker = new ReviewProgressTracker((p) => events.push(p));

  tracker.handle({
    type: "tool_call",
    round: 0,
    callId: "c1",
    name: "write_file",
    args: {},
  });

  assertEquals(events.length, 1);
  assertEquals(events[0].phase, "working");
});
