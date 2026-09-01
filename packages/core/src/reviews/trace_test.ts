import type { ModelResult, Tool } from "@openrouter/agent";
import { assertEquals } from "@std/assert";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { EventTraceStore } from "@/reviews/trace.ts";
import type { ReviewTraceEvent, TracedReviewEvent } from "@/reviews/types.ts";

function makeStream(events: unknown[]): ModelResult<readonly Tool[]> {
  return {
    getFullResponsesStream: async function* () {
      for (const event of events) yield event;
    },
  } as unknown as ModelResult<readonly Tool[]>;
}

function setup() {
  const adapter = new InMemoryAdapter();
  const store = new EventTraceStore(adapter);
  return { adapter, store };
}

async function readTrace(
  store: EventTraceStore,
  workspaceId: string,
  runId: string,
): Promise<TracedReviewEvent[]> {
  const trace = await store.get({ workspaceId, runId });
  if (!trace) throw new Error(`no trace for run ${runId}`);
  return trace;
}

function assertEvent<T extends ReviewTraceEvent["type"]>(
  event: TracedReviewEvent,
  type: T,
): Extract<ReviewTraceEvent, { type: T }> {
  assertEquals(event.type, type);
  return event as unknown as Extract<ReviewTraceEvent, { type: T }>;
}

Deno.test("EventTraceStore -- roundtrips events through append and get", async () => {
  const { store } = setup();
  const recorder = store.recorder({ workspaceId: "ws", runId: "run1" });
  recorder.record({ type: "input", text: "the prompt" });
  recorder.record({ type: "round_start", round: 0 });
  recorder.record({ type: "message", round: 0, text: "final answer" });
  await recorder.flush();

  const trace = await readTrace(store, "ws", "run1");
  assertEquals(trace.length, 3);
  assertEquals(trace[0].seq, 0);
  assertEquals(assertEvent(trace[0], "input").text, "the prompt");
  assertEquals(assertEvent(trace[2], "message").text, "final answer");
});

Deno.test("EventTraceStore -- get returns undefined for absent trace", async () => {
  const { store } = setup();
  const trace = await store.get({ workspaceId: "ws", runId: "missing" });
  assertEquals(trace, undefined);
});

Deno.test("EventTraceStore -- persists each event individually in order", async () => {
  const { store } = setup();
  const recorder = store.recorder({ workspaceId: "ws", runId: "big" });
  for (let i = 0; i < 300; i++) {
    recorder.record({ type: "message", round: 0, text: "x".repeat(2_000) });
  }
  await recorder.flush();

  const trace = await readTrace(store, "ws", "big");
  assertEquals(trace.length, 300);
  assertEquals(
    trace.map((e) => e.seq),
    Array.from({ length: 300 }, (_, i) => i),
  );
});

Deno.test("TraceRecorder -- maps stream events into trace events", async () => {
  const { store } = setup();
  const recorder = store.recorder({ workspaceId: "ws", runId: "run2" });
  recorder.record({ type: "input", text: "the prompt" });
  recorder.follow(
    makeStream([
      { type: "turn.start", turnNumber: 0, timestamp: 1 },
      {
        type: "response.output_item.done",
        item: {
          type: "reasoning",
          id: "r1",
          status: "completed",
          summary: [{ type: "summary_text", text: "Plan the review" }],
          content: [{ type: "reasoning_text", text: "Deep thought" }],
        },
      },
      {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          id: "f1",
          callId: "call1",
          name: "read_file",
          arguments: '{"path":"essay.md"}',
          status: "completed",
        },
      },
      {
        type: "tool.call_output",
        timestamp: 2,
        output: {
          type: "function_call_output",
          callId: "call1",
          output: JSON.stringify({ content: "The essay text" }),
        },
      },
      {
        type: "response.completed",
        response: {
          usage: {
            inputTokens: 10,
            inputTokensDetails: { cachedTokens: 2 },
            outputTokens: 5,
            outputTokensDetails: { reasoningTokens: 3 },
            totalTokens: 15,
            cost: 0.01,
          },
        },
      },
      { type: "turn.end", turnNumber: 0, timestamp: 3 },
      { type: "turn.start", turnNumber: 1, timestamp: 4 },
      {
        type: "response.output_item.done",
        item: {
          type: "message",
          id: "m1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Final review" }],
        },
      },
      { type: "turn.end", turnNumber: 1, timestamp: 5 },
    ]),
  );
  await recorder.flush();

  const trace = await readTrace(store, "ws", "run2");
  assertEquals(
    trace.map((e) => e.type),
    [
      "input",
      "round_start",
      "reasoning",
      "tool_call",
      "tool_output",
      "usage",
      "round_end",
      "round_start",
      "message",
      "round_end",
    ],
  );

  const reasoning = assertEvent(trace[2], "reasoning");
  assertEquals(reasoning.round, 0);
  assertEquals(reasoning.text, "Deep thought\nPlan the review");

  const toolCall = assertEvent(trace[3], "tool_call");
  assertEquals(toolCall.name, "read_file");
  assertEquals(toolCall.callId, "call1");
  assertEquals(toolCall.args, { path: "essay.md" });

  const toolOutput = assertEvent(trace[4], "tool_output");
  assertEquals(toolOutput.output, { content: "The essay text" });
  assertEquals(toolOutput.truncated, undefined);

  const usage = assertEvent(trace[5], "usage");
  assertEquals(usage.round, 0);
  assertEquals(usage.usage, {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    cachedTokens: 2,
    reasoningTokens: 3,
    cost: 0.01,
  });

  const message = assertEvent(trace[8], "message");
  assertEquals(message.round, 1);
  assertEquals(message.text, "Final review");
});

Deno.test("TraceRecorder -- truncates oversized tool outputs", async () => {
  const { store } = setup();
  const recorder = store.recorder({ workspaceId: "ws", runId: "run3" });
  recorder.follow(
    makeStream([
      {
        type: "tool.call_output",
        timestamp: 1,
        output: {
          type: "function_call_output",
          callId: "call1",
          output: JSON.stringify({ content: "y".repeat(20_000) }),
        },
      },
    ]),
  );
  await recorder.flush();

  const trace = await readTrace(store, "ws", "run3");
  const toolOutput = assertEvent(trace[0], "tool_output");
  assertEquals(toolOutput.truncated, true);
  const output = toolOutput.output as string;
  assertEquals(output.length, 16_000);
  assertEquals(output.startsWith('{"content":"yyy'), true);
});

Deno.test("TraceRecorder -- records an error event when the stream throws", async () => {
  const { store } = setup();
  const recorder = store.recorder({ workspaceId: "ws", runId: "run4" });
  recorder.follow({
    getFullResponsesStream: () =>
      ({
        async *[Symbol.asyncIterator]() {
          yield { type: "turn.start", turnNumber: 0, timestamp: 1 };
          throw new Error("stream exploded");
        },
      }) as never,
  } as unknown as ModelResult<readonly Tool[]>);
  await recorder.flush();

  const trace = await readTrace(store, "ws", "run4");
  assertEquals(trace.length, 2);
  assertEquals(trace[0].type, "round_start");
  const error = assertEvent(trace[1], "error");
  assertEquals(error.round, 0);
  assertEquals(error.error, "stream exploded");
});

Deno.test("TraceRecorder -- flush is idempotent", async () => {
  const { store } = setup();
  const recorder = store.recorder({ workspaceId: "ws", runId: "run5" });
  recorder.record({ type: "input", text: "prompt" });
  await recorder.flush();
  recorder.record({ type: "message", round: 0, text: "late" });
  await recorder.flush();

  const trace = await store.get({ workspaceId: "ws", runId: "run5" });
  assertEquals(trace?.length, 1);
});
