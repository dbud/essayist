import type {
  CallModelInput,
  ModelResult,
  PostModelCallPayload,
  RequestOptions,
  Tool,
} from "@openrouter/agent";
import { HooksManager } from "@openrouter/agent";
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { z } from "zod";
import {
  Agent,
  type ModelClient,
  RETRY_OPTIONS,
  StructuredParseError,
} from "./agent.ts";

interface FakeRound {
  text: string;
  reasoning?: string;
  model?: string;
  durationMs?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    cost?: number;
  };
}

// A minimal ModelResult stand-in. getText() feeds the parse path;
// getFullResponsesStream() feeds reasoning capture; getUsage() feeds usage.
function fakeResult(round: FakeRound): ModelResult<readonly Tool[]> {
  return {
    getText: () => Promise.resolve(round.text),
    getTextStream: async function* () {
      yield round.text;
    },
    getItemsStream: async function* () {},
    getFullResponsesStream: async function* () {
      if (round.reasoning !== undefined) {
        yield {
          type: "response.output_item.done",
          item: {
            type: "reasoning",
            content: [{ text: round.reasoning }],
            summary: [],
          },
        };
      }
    },
    getUsage: () =>
      Promise.resolve({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        modelCalls: 1,
        ...round.usage,
      }),
    cancel: () => {},
  } as unknown as ModelResult<readonly Tool[]>;
}

function createSpyClient(rounds: FakeRound[]): {
  client: ModelClient;
  inputs: string[];
  options: (RequestOptions | undefined)[];
} {
  const inputs: string[] = [];
  const options: (RequestOptions | undefined)[] = [];
  const client = {
    callModel: (request: CallModelInput, requestOptions?: RequestOptions) => {
      inputs.push(String(request.input));
      options.push(requestOptions);
      const round = rounds[Math.min(inputs.length - 1, rounds.length - 1)];
      // Fire PostModelCall the way the SDK does, so the agent's model-call
      // collection is exercised without a live provider.
      const hooks = request.hooks;
      if (hooks instanceof HooksManager) {
        queueMicrotask(() => {
          void hooks.emit("PostModelCall", {
            sessionId: "s",
            responseId: "r",
            model: round.model ?? "test/model",
            durationMs: round.durationMs ?? 1,
            turnType: "initial",
            turnNumber: 1,
            ...(round.usage ? { usage: round.usage } : {}),
          } as PostModelCallPayload);
        });
      }
      return fakeResult(round);
    },
  };
  return { client, inputs, options };
}

Deno.test("RETRY_OPTIONS -- opts 429 into retry and caps total wait at 2 min", () => {
  assertEquals(RETRY_OPTIONS.retryCodes, ["429", "5XX"]);
  const retries = RETRY_OPTIONS.retries;
  assertExists(retries);
  assertEquals(retries.strategy, "backoff");
  if (retries.strategy === "backoff") {
    const backoff = retries.backoff;
    assertExists(backoff);
    assertEquals(backoff.initialInterval, 1000);
    assertEquals(backoff.maxInterval, 30_000);
    assertEquals(backoff.exponent, 2);
    assertEquals(backoff.maxElapsedTime, 120_000);
    assertEquals(retries.retryConnectionErrors, true);
  }
});

Deno.test("Agent.callModelStructured -- parses output and captures reasoning and usage", async () => {
  const { client } = createSpyClient([
    {
      text: '{"ok":true}',
      reasoning: "weighing the options",
      model: "openai/gpt-5.2",
      durationMs: 1200,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cachedTokens: 1,
        reasoningTokens: 4,
        cost: 0.01,
      },
    },
  ]);
  const agent = new Agent("test-key", client);

  const result = await agent.callModelStructured(
    "ping",
    z.object({ ok: z.boolean() }),
    ["m/a", "m/b"],
  );

  assertEquals(result.output, { ok: true });
  assertEquals(result.calls, [
    {
      sessionId: "s",
      responseId: "r",
      model: "openai/gpt-5.2",
      durationMs: 1200,
      turnType: "initial",
      turnNumber: 1,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cachedTokens: 1,
        reasoningTokens: 4,
        cost: 0.01,
      },
    },
  ]);
  assertEquals(result.usage, {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    cachedTokens: 1,
    reasoningTokens: 4,
    modelCalls: 1,
    cost: 0.01,
  });
  assertEquals(result.reasoning, ["weighing the options"]);
});

Deno.test("Agent.callModelStructured -- re-asks once on invalid output and combines usage", async () => {
  const { client, inputs } = createSpyClient([
    {
      text: "not json at all",
      reasoning: "first attempt thinking",
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        cachedTokens: 0,
        reasoningTokens: 1,
        cost: 0.01,
      },
    },
    {
      text: '{"ok":true}',
      reasoning: "second attempt thinking",
      usage: {
        inputTokens: 2,
        outputTokens: 2,
        totalTokens: 4,
        cachedTokens: 0,
        reasoningTokens: 1,
        cost: 0.02,
      },
    },
  ]);
  const agent = new Agent("test-key", client);

  const result = await agent.callModelStructured(
    "ping",
    z.object({ ok: z.boolean() }),
    ["m/a"],
  );

  assertEquals(inputs.length, 2);
  assertEquals(inputs[1].includes("not json at all"), true);
  assertEquals(inputs[1].includes("Validation error"), true);
  assertEquals(
    result.calls.map((call) => call.turnType),
    ["initial", "initial"],
  );
  assertEquals(result.output, { ok: true });
  assertEquals(result.usage, {
    inputTokens: 3,
    outputTokens: 3,
    totalTokens: 6,
    cachedTokens: 0,
    reasoningTokens: 2,
    modelCalls: 2,
    cost: 0.03,
  });
  assertEquals(result.reasoning, [
    "first attempt thinking",
    "second attempt thinking",
  ]);
});

Deno.test("Agent.callModelStructured -- omits a round that had no reasoning", async () => {
  const { client } = createSpyClient([
    { text: "not json at all" },
    { text: '{"ok":true}', reasoning: "only the second attempt thought" },
  ]);
  const agent = new Agent("test-key", client);

  const result = await agent.callModelStructured(
    "ping",
    z.object({ ok: z.boolean() }),
    ["m/a"],
  );

  assertEquals(result.reasoning, ["only the second attempt thought"]);
});

Deno.test("Agent.callModelStructured -- forwards RETRY_OPTIONS and appends schema instructions", async () => {
  const { client, inputs, options } = createSpyClient([
    {
      text: '{"ok":true}',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
      },
    },
  ]);
  const agent = new Agent("test-key", client);

  const result = await agent.callModelStructured(
    "ping",
    z.object({ ok: z.boolean() }),
    ["m/a"],
    { includeExample: true },
  );

  assertEquals(options[0], RETRY_OPTIONS);
  assertEquals(
    inputs[0].includes("Return only one valid JSON object matching this shape"),
    true,
  );
  assertEquals(result.reasoning, []);
});

Deno.test("Agent.callModelStructured -- throws StructuredParseError when the retry also fails", async () => {
  const { client, inputs } = createSpyClient([
    { text: "still bad" },
    { text: "worse" },
  ]);
  const agent = new Agent("test-key", client);

  const err = await assertRejects(
    () =>
      agent.callModelStructured("ping", z.object({ ok: z.boolean() }), ["m/a"]),
    StructuredParseError,
  );
  assertEquals(err.raw, "worse");
  assertEquals(inputs.length, 2);
});

Deno.test("Agent.callModelWithTools -- forwards RETRY_OPTIONS to the OpenRouter client", () => {
  const options: (RequestOptions | undefined)[] = [];
  const client = {
    callModel: (_request: unknown, requestOptions?: RequestOptions) => {
      options.push(requestOptions);
      return fakeResult({ text: '{"ok":true}' });
    },
  };
  const agent = new Agent("test-key", client);

  agent.callModelWithTools("ping", [], ["m/a", "m/b"]);

  assertEquals(options.length, 1);
  assertEquals(options[0], RETRY_OPTIONS);
});
