import { assertEquals } from "@std/assert";
import type { FlowEvent } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { foldCompleted } from "./fold.ts";
import type { TraceEvent } from "./types.ts";

/** Stamps a bare flow event as a trace event. */
function event(seq: number, flow: FlowEvent<ReviewTypes>): TraceEvent {
  return { seq, at: seq, ...flow };
}

Deno.test("foldCompleted -- reads completed nodes with what they committed", () => {
  const folded = foldCompleted([
    event(0, { type: "node_start", nodeId: "content" }),
    event(1, {
      type: "node_end",
      nodeId: "content",
      run: {
        nodeId: "content",
        status: "completed",
        startedAt: 0,
        completedAt: 1,
        artifacts: [{ type: "content", data: "essay", producedBy: "content" }],
      },
    }),
  ]);

  assertEquals(folded.get("content"), [
    { type: "content", data: "essay", producedBy: "content" },
  ]);
});

Deno.test("foldCompleted -- treats a node that committed nothing as completed", () => {
  const folded = foldCompleted([
    event(0, {
      type: "node_end",
      nodeId: "repair",
      run: {
        nodeId: "repair",
        status: "completed",
        startedAt: 0,
        completedAt: 1,
        artifacts: [],
      },
    }),
  ]);

  assertEquals(folded.has("repair"), true);
  assertEquals(folded.get("repair"), []);
});

Deno.test("foldCompleted -- leaves out failed and skipped nodes", () => {
  const folded = foldCompleted([
    event(0, {
      type: "node_end",
      nodeId: "bad",
      run: {
        nodeId: "bad",
        status: "failed",
        startedAt: 0,
        completedAt: 1,
        error: "boom",
      },
    }),
    event(1, {
      type: "node_end",
      nodeId: "downstream",
      run: {
        nodeId: "downstream",
        status: "skipped",
        reason: 'dependency "bad" failed: boom',
      },
    }),
  ]);

  assertEquals([...folded.keys()], []);
});

Deno.test("foldCompleted -- ignores custom events carrying artifact data", () => {
  const folded = foldCompleted([
    event(0, {
      type: "custom",
      nodeId: "propose",
      event: { type: "output", output: { type: "marks", data: [] } },
    }),
  ]);

  assertEquals([...folded.keys()], []);
});

Deno.test("foldCompleted -- a later node_end for a node wins", () => {
  const folded = foldCompleted([
    event(0, {
      type: "node_end",
      nodeId: "propose",
      run: {
        nodeId: "propose",
        status: "completed",
        startedAt: 0,
        completedAt: 1,
        artifacts: [{ type: "summary", data: "first", producedBy: "propose" }],
      },
    }),
    event(1, {
      type: "node_end",
      nodeId: "propose",
      run: {
        nodeId: "propose",
        status: "completed",
        startedAt: 2,
        completedAt: 3,
        artifacts: [{ type: "summary", data: "second", producedBy: "propose" }],
      },
    }),
  ]);

  assertEquals(folded.get("propose"), [
    { type: "summary", data: "second", producedBy: "propose" },
  ]);
});

Deno.test("foldCompleted -- reads an empty trace as nothing completed", () => {
  assertEquals([...foldCompleted([]).keys()], []);
});
