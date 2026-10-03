import { assertEquals } from "@std/assert";
import type { FlowEvent, NodeKind } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import type { TraceEvent } from "./types.ts";
import { groupTraceNodes } from "./view.ts";

/** Stamps seq and a wall clock so folds see realistic trace entries. */
function trace(events: FlowEvent<ReviewTypes>[]): TraceEvent[] {
  return events.map(
    (event, seq) => ({ ...event, seq, at: 100 + seq }) as TraceEvent,
  );
}

Deno.test("groupTraceNodes -- groups custom events under their node", () => {
  const { nodes } = groupTraceNodes(
    trace([
      { type: "node_start", nodeId: "analyze" },
      {
        type: "custom",
        nodeId: "analyze",
        event: { type: "prompt", text: "read" },
      },
      {
        type: "custom",
        nodeId: "analyze",
        event: { type: "reasoning", text: "thinking" },
      },
      {
        type: "node_end",
        nodeId: "analyze",
        run: {
          nodeId: "analyze",
          status: "completed",
          startedAt: 100,
          completedAt: 140,
          artifacts: [],
        },
      },
    ]),
  );

  assertEquals(nodes.length, 1);
  assertEquals(nodes[0].nodeId, "analyze");
  assertEquals(
    nodes[0].events.map((e) => e.type),
    ["prompt", "reasoning"],
  );
  assertEquals(nodes[0].status, "completed");
  assertEquals(nodes[0].completedAt, 140);
});

Deno.test("groupTraceNodes -- keeps node order as first-start order", () => {
  const { nodes } = groupTraceNodes(
    trace([
      { type: "node_start", nodeId: "source" },
      {
        type: "node_end",
        nodeId: "source",
        run: {
          nodeId: "source",
          status: "completed",
          startedAt: 100,
          completedAt: 110,
          artifacts: [],
        },
      },
      { type: "node_start", nodeId: "analyze" },
      {
        type: "node_end",
        nodeId: "analyze",
        run: {
          nodeId: "analyze",
          status: "completed",
          startedAt: 110,
          completedAt: 200,
          artifacts: [],
        },
      },
    ]),
  );
  assertEquals(
    nodes.map((n) => n.nodeId),
    ["source", "analyze"],
  );
});

Deno.test("groupTraceNodes -- records failure error and skip reason", () => {
  const { nodes } = groupTraceNodes(
    trace([
      { type: "node_start", nodeId: "boom" },
      {
        type: "node_end",
        nodeId: "boom",
        run: {
          nodeId: "boom",
          status: "failed",
          startedAt: 100,
          completedAt: 120,
          error: "model refused",
        },
      },
      { type: "node_start", nodeId: "gate" },
      {
        type: "node_end",
        nodeId: "gate",
        run: { nodeId: "gate", status: "skipped", reason: "no failures" },
      },
    ]),
  );
  assertEquals(nodes[0].status, "failed");
  assertEquals(nodes[0].error, "model refused");
  assertEquals(nodes[1].status, "skipped");
  assertEquals(nodes[1].reason, "no failures");
  assertEquals(nodes[1].completedAt, undefined);
});

/** A model_call event carrying the given per-call usage. */
function modelCall(
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    cost?: number;
  },
  nodeId = "n",
): FlowEvent<ReviewTypes> {
  return {
    type: "custom",
    nodeId,
    event: {
      type: "model_call",
      call: {
        sessionId: "s",
        responseId: "r",
        model: "openai/gpt-5.2",
        durationMs: 100,
        turnType: "initial",
        turnNumber: 1,
        ...(usage ? { usage } : {}),
      },
    },
  };
}

Deno.test("groupTraceNodes -- totals usage across every model call", () => {
  const { totals } = groupTraceNodes(
    trace([
      { type: "node_start", nodeId: "a" },
      modelCall(
        {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          cachedTokens: 0,
          reasoningTokens: 0,
          cost: 0.25,
        },
        "a",
      ),
      {
        type: "node_end",
        nodeId: "a",
        run: {
          nodeId: "a",
          status: "completed",
          startedAt: 100,
          completedAt: 110,
          artifacts: [],
        },
      },
      { type: "node_start", nodeId: "b" },
      modelCall(
        {
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
          cachedTokens: 0,
          reasoningTokens: 0,
        },
        "b",
      ),
    ]),
  );
  assertEquals(totals, {
    inputTokens: 11,
    outputTokens: 7,
    cost: 0.25,
    modelCalls: 2,
  });
});

Deno.test("groupTraceNodes -- a model call without usage still counts", () => {
  const { totals } = groupTraceNodes(
    trace([{ type: "node_start", nodeId: "a" }, modelCall(undefined, "a")]),
  );
  assertEquals(totals, {
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    modelCalls: 1,
  });
});

Deno.test("groupTraceNodes -- orphans a custom event with no node", () => {
  const { nodes, orphans } = groupTraceNodes(
    trace([
      {
        type: "custom",
        nodeId: "ghost",
        event: { type: "prompt", text: "stray" },
      },
    ]),
  );
  assertEquals(nodes.length, 0);
  assertEquals(
    orphans.map((e) => e.type),
    ["custom"],
  );
});

Deno.test("groupTraceNodes -- a skipped node opens its own section", () => {
  // A node skipped for a failed dependency emits node_end with no
  // node_start, so it must still get a section carrying the reason.
  const { nodes, orphans } = groupTraceNodes(
    trace([
      { type: "node_start", nodeId: "structure.propose" },
      {
        type: "node_end",
        nodeId: "structure.propose",
        run: {
          nodeId: "structure.propose",
          status: "failed",
          startedAt: 100,
          completedAt: 200,
          error: "upstream idle timeout",
        },
      },
      {
        type: "node_end",
        nodeId: "structure.collect",
        run: {
          nodeId: "structure.collect",
          status: "skipped",
          reason: 'dependency "structure.propose" failed',
        },
      },
    ]),
  );

  assertEquals(orphans.length, 0);
  assertEquals(
    nodes.map((n) => n.nodeId),
    ["structure.propose", "structure.collect"],
  );
  const skipped = nodes[1];
  assertEquals(skipped.status, "skipped");
  assertEquals(skipped.reason, 'dependency "structure.propose" failed');
  // A skipped node never ran, so it has no start time of its own.
  assertEquals(skipped.startedAt, undefined);
  assertEquals(skipped.completedAt, undefined);
});

Deno.test("groupTraceNodes -- attaches kind when a map is supplied", () => {
  const kindOf = new Map<string, NodeKind<ReviewTypes>>([
    ["analyze", "analyze"],
  ]);
  const { nodes } = groupTraceNodes(
    trace([
      { type: "node_start", nodeId: "analyze" },
      { type: "node_start", nodeId: "other" },
    ]),
    kindOf,
  );
  assertEquals(nodes[0].kind, "analyze");
  assertEquals(nodes[1].kind, undefined);
});

Deno.test("groupTraceNodes -- applied events collect attempts", () => {
  const { nodes } = groupTraceNodes(
    trace([
      { type: "node_start", nodeId: "u.apply" },
      {
        type: "custom",
        nodeId: "u.apply",
        event: {
          type: "applied",
          attempts: [
            { selected_text: "a", comment: "tighten", marked: true },
            {
              selected_text: "b",
              comment: "cut",
              marked: false,
              error: "no anchor",
            },
          ],
        },
      },
    ]),
  );
  const applied = nodes[0].events[0];
  assertEquals(applied?.type, "applied");
  assertEquals(applied?.type === "applied" ? applied.attempts.length : 0, 2);
});
