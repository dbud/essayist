import type {
  CallModelInput,
  ModelResult,
  PostModelCallPayload,
  RequestOptions,
  Tool,
} from "@openrouter/agent";
import { HooksManager } from "@openrouter/agent";
import { assert, assertEquals } from "@std/assert";
import { Effect, Result } from "effect";
import { z } from "zod";
import {
  RETRY_OPTIONS,
  type RetryFailure,
  ROUND_RETRY_DELAY_MS,
  type StructuredCallOptions,
  StructuredParseError,
  type ModelClient as Transport,
} from "@/agent.ts";
import { ModelCallError, ModelClient } from "./service.ts";

interface FakeRound {
  text: string;
  reasoning?: string;
  model?: string;
  durationMs?: number;
  /** Rejects getText with this, as a dropped connection would. */
  failWith?: Error;
  turnType?: PostModelCallPayload["turnType"];
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
  client: Transport;
  inputs: string[];
  options: (RequestOptions | undefined)[];
} {
  const inputs: string[] = [];
  const options: (RequestOptions | undefined)[] = [];
  const client: Transport = {
    callModel: (request: CallModelInput, requestOptions?: RequestOptions) => {
      inputs.push(String(request.input));
      options.push(requestOptions);
      const round = rounds[Math.min(inputs.length - 1, rounds.length - 1)];
      const hooks = request.hooks;
      const result = fakeResult(round);
      if (hooks instanceof HooksManager) {
        // The SDK emits UserPromptSubmit from the first stream read, not from
        // callModel, so fire it from getText the way the engine does.
        const submitPrompt = () =>
          void hooks.emit("UserPromptSubmit", {
            prompt: String(request.input),
          });
        const onGetText = result.getText;
        result.getText = () => {
          submitPrompt();
          if (round.failWith) return Promise.reject(round.failWith);
          return onGetText();
        };
        if (!round.failWith) {
          queueMicrotask(() => {
            void hooks.emit("PostModelCall", {
              sessionId: "s",
              responseId: "r",
              model: round.model ?? "test/model",
              durationMs: round.durationMs ?? 1,
              turnType: round.turnType ?? "initial",
              turnNumber: 1,
              ...(round.usage ? { usage: round.usage } : {}),
            } as PostModelCallPayload);
          });
        }
      }
      return result;
    },
  };
  return { client, inputs, options };
}

/** Retry tests assert attempt counts and payloads, not elapsed time. */
const noSleep = () => Promise.resolve();

/** Provide a program with the service over the spy transport. */
const provideWith = <A, E>(
  program: Effect.Effect<A, E, ModelClient>,
  client: Transport,
  sleep: (ms: number) => Promise<void> = noSleep,
): Effect.Effect<A, E> =>
  Effect.provide(program, ModelClient.layerOf(client, sleep));

function structured<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  options?: StructuredCallOptions,
) {
  return Effect.gen(function* () {
    const model = yield* ModelClient;
    return yield* model.callModelStructured("ping", schema, ["m/a"], options);
  });
}

Deno.test("ModelClient.callModelStructured -- parses the first reply", async () => {
  const { client } = createSpyClient([
    { text: '{"ok":true}', reasoning: "because" },
  ]);

  const result = await Effect.runPromise(
    provideWith(structured(z.object({ ok: z.boolean() })), client),
  );

  assertEquals(result.output, { ok: true });
  assertEquals(result.reasoning, ["because"]);
  assertEquals(result.repairs, []);
  assertEquals(result.usage.modelCalls, 1);
});

Deno.test("ModelClient.callModelStructured -- an invalid reply triggers the re-ask", async () => {
  const { client, inputs } = createSpyClient([
    { text: "not json at all" },
    { text: '{"ok":true}' },
  ]);

  const result = await Effect.runPromise(
    provideWith(structured(z.object({ ok: z.boolean() })), client),
  );

  assertEquals(inputs.length, 2);
  assertEquals(inputs[1].includes("not json at all"), true);
  assertEquals(result.output, { ok: true });
  assertEquals(result.repairs.length, 1);
  assertEquals(result.usage.modelCalls, 2);
});

Deno.test("ModelClient.callModelStructured -- a second parse failure fails typed", async () => {
  const { client } = createSpyClient([
    { text: "wrong once" },
    { text: "wrong twice" },
  ]);

  const outcome = await Effect.runPromise(
    provideWith(
      Effect.result(structured(z.object({ ok: z.boolean() }))),
      client,
    ),
  );

  assert(Result.isFailure(outcome), "the double parse failure must fail");
  if (Result.isFailure(outcome)) {
    assert(
      outcome.failure instanceof StructuredParseError,
      "the parse failure type",
    );
  }
});

Deno.test("ModelClient.callModelStructured -- a transient failure is re-issued", async () => {
  const abort = new Error(
    'Response failed: {"code":"server_error","message":"The operation was aborted"}',
  );
  const { client, inputs } = createSpyClient([
    { text: '{"ok":true}', failWith: abort },
    { text: '{"ok":true}' },
  ]);

  const result = await Effect.runPromise(
    provideWith(structured(z.object({ ok: z.boolean() })), client),
  );

  assertEquals(inputs.length, 2);
  assertEquals(result.output, { ok: true });
  // The retry is the same prompt, not a repair.
  assertEquals(result.repairs, []);
});

Deno.test("ModelClient.callModelStructured -- a transient failure reports the retry", async () => {
  const abort = new Error(
    'Response failed: {"code":"server_error","message":"The operation was aborted"}',
  );
  const { client } = createSpyClient([
    { text: '{"ok":true}', failWith: abort },
    { text: '{"ok":true}' },
  ]);
  const retries: RetryFailure[] = [];

  await Effect.runPromise(
    provideWith(
      structured(z.object({ ok: z.boolean() }), {
        onRetry: (failure) => retries.push(failure),
      }),
      client,
    ),
  );

  assertEquals(retries, [
    {
      attempt: 1,
      error:
        'Response failed: {"code":"server_error","message":"The operation was aborted"}',
    },
  ]);
});

Deno.test("ModelClient.callModelStructured -- a transient failure gives up after three attempts", async () => {
  const abort = new Error("fetch failed");
  const { client, inputs } = createSpyClient([
    { text: '{"ok":true}', failWith: abort },
  ]);
  const slept: number[] = [];
  const recordSleep = (ms: number) => {
    slept.push(ms);
    return Promise.resolve();
  };

  const outcome = await Effect.runPromise(
    provideWith(
      Effect.result(structured(z.object({ ok: z.boolean() }))),
      client,
      recordSleep,
    ),
  );

  assert(Result.isFailure(outcome), "exhausted retries must fail");
  if (Result.isFailure(outcome)) {
    assert(outcome.failure instanceof ModelCallError, "the model error type");
  }
  assertEquals(inputs.length, 3);
  // Linear in the attempt number.
  assertEquals(slept, [ROUND_RETRY_DELAY_MS, 2 * ROUND_RETRY_DELAY_MS]);
});

Deno.test("ModelClient.callModelStructured -- a deterministic failure is not retried", async () => {
  const { client, inputs } = createSpyClient([
    { text: '{"ok":true}', failWith: new SyntaxError("Unexpected token") },
  ]);

  await Effect.runPromise(
    provideWith(
      Effect.result(structured(z.object({ ok: z.boolean() }))),
      client,
    ),
  );

  assertEquals(inputs.length, 1);
});

Deno.test("ModelClient.callModelStructured -- a re-ask that fails transiently is retried", async () => {
  const { client, inputs } = createSpyClient([
    { text: "not json at all" },
    { text: '{"ok":true}', failWith: new Error("socket hang up") },
    { text: '{"ok":true}' },
  ]);

  const result = await Effect.runPromise(
    provideWith(structured(z.object({ ok: z.boolean() })), client),
  );

  // One repair prompt, then two attempts at the same re-ask.
  assertEquals(inputs.length, 3);
  assertEquals(inputs[1], inputs[2]);
  assertEquals(inputs[1].includes("not json at all"), true);
  assertEquals(result.output, { ok: true });
  assertEquals(result.repairs.length, 1);
});

Deno.test("ModelClient.callModelWithTools -- forwards the request options", async () => {
  const { client, options } = createSpyClient([{ text: "hi" }]);

  const result = await Effect.runPromise(
    provideWith(
      Effect.gen(function* () {
        const model = yield* ModelClient;
        return yield* model.callModelWithTools("input", [], ["m/a"], 2);
      }),
      client,
    ),
  );
  const text = await result.getText();

  assertEquals(text, "hi");
  assertEquals(options[0], RETRY_OPTIONS);
});
