import type {
  ReviewProgress,
  ReviewTraceEvent,
  TracedReviewEvent,
} from "@essayist/core";
import { ReviewProgressTracker } from "@essayist/core";
import { assertEquals } from "@std/assert";
import { playTrace } from "./reviewReplay.ts";

function traced(
  seq: number,
  at: number,
  event: ReviewTraceEvent,
): TracedReviewEvent {
  return { seq, at, ...event };
}

/** A trace with gaps long enough to make timing scaling visible. */
function sampleTrace(): TracedReviewEvent[] {
  return [
    traced(0, 1000, { type: "input", text: "review this" }),
    traced(1, 1000, { type: "round_start", round: 0 }),
    traced(2, 1200, {
      type: "tool_call",
      round: 0,
      callId: "c1",
      name: "read_file",
      args: {},
    }),
    traced(3, 1500, {
      type: "tool_output",
      round: 0,
      callId: "c1",
      output: "ok",
    }),
    traced(4, 1600, {
      type: "tool_call",
      round: 0,
      callId: "c2",
      name: "mark",
      args: {},
    }),
    traced(5, 1700, {
      type: "tool_output",
      round: 0,
      callId: "c2",
      output: { results: [{ marked: true }, { marked: false }] },
    }),
    traced(6, 2000, { type: "message", round: 0, text: "done" }),
  ];
}

function captureSleep(log: number[]) {
  return (ms: number) => {
    log.push(ms);
    return Promise.resolve();
  };
}

Deno.test("playTrace -- empty trace completes without events", async () => {
  const seen: TracedReviewEvent[] = [];

  const done = await playTrace([], (event) => seen.push(event));

  assertEquals(done, true);
  assertEquals(seen, []);
});

Deno.test("playTrace -- gaps scaled by speed, events in order", async () => {
  const sleeps: number[] = [];
  const seen: { at: number; seq: number }[] = [];

  const done = await playTrace(
    sampleTrace(),
    (event, at) => seen.push({ at, seq: event.seq }),
    { speed: () => 2, sleep: captureSleep(sleeps) },
  );

  assertEquals(done, true);
  assertEquals(sleeps, [0, 0, 100, 150, 50, 50, 150]);
  assertEquals(seen, [
    { at: 0, seq: 0 },
    { at: 0, seq: 1 },
    { at: 200, seq: 2 },
    { at: 500, seq: 3 },
    { at: 600, seq: 4 },
    { at: 700, seq: 5 },
    { at: 1000, seq: 6 },
  ]);
});

Deno.test("playTrace -- speed change applies from the next gap", async () => {
  const speeds = [1, 2, 1];
  const sleeps: number[] = [];

  await playTrace(sampleTrace(), () => {}, {
    speed: () => speeds.shift() ?? 1,
    sleep: captureSleep(sleeps),
  });

  assertEquals(sleeps, [0, 0, 200, 300, 100, 100, 300]);
});

Deno.test("playTrace -- cancellation stops before the next event", async () => {
  const seen: number[] = [];

  const done = await playTrace(sampleTrace(), () => seen.push(1), {
    isCancelled: () => seen.length >= 2,
    sleep: () => Promise.resolve(),
  });

  assertEquals(done, false);
  assertEquals(seen.length, 2);
});

Deno.test("playTrace -- client wraps events via ReviewProgressTracker", async () => {
  const snapshots: { at: number; progress: ReviewProgress }[] = [];
  let at = 0;
  const tracker = new ReviewProgressTracker((progress) => {
    snapshots.push({ at, progress });
  });

  await playTrace(
    sampleTrace(),
    (event, atMs) => {
      at = atMs;
      tracker.handle(event);
    },
    { sleep: () => Promise.resolve() },
  );

  assertEquals(
    snapshots.map((s) => s.at),
    [0, 200, 600, 700, 1000],
  );
  assertEquals(
    snapshots.map((s) => s.progress.phase),
    ["working", "reading", "annotating", "annotating", "summarizing"],
  );
  assertEquals(
    snapshots.map((s) => s.progress.notes),
    [0, 0, 0, 1, 1],
  );
});
