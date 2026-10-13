import type {
  CallModelInput,
  ModelResult,
  PostModelCallPayload,
  RequestOptions,
  Tool,
} from "@openrouter/agent";
import { HooksManager } from "@openrouter/agent";
import { assert, assertEquals } from "@std/assert";
import { Duration, Effect, Fiber, Result, Schema } from "effect";
import { TestClock } from "effect/testing";
import { ModelCallError, ModelClient } from "./service.ts";
import {
  type RetryFailure,
  ROUND_RETRY_DELAY_MS,
  type StructuredCallOptions,
  StructuredParseError,
  type ModelClient as Transport,
} from "./transport.ts";

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

/** Provide a program with the service over the spy transport. */
const provideWith = <A, E>(
  program: Effect.Effect<A, E, ModelClient>,
  client: Transport,
): Effect.Effect<A, E> => Effect.provide(program, ModelClient.layerOf(client));

function structured<T extends Schema.ConstraintDecoder<unknown>>(
  schema: T,
  options?: StructuredCallOptions,
) {
  return Effect.gen(function* () {
    const model = yield* ModelClient;
    return yield* model.callModelStructured("ping", schema, ["m/a"], options);
  });
}

/**
 * Run a retrying program on the test clock: fork it, advance time through
 * the sleeps, and join.
 */
const runClock = <A, E>(
  program: Effect.Effect<A, E, ModelClient>,
  client: Transport,
  advance: Duration.Input[],
) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(provideWith(program, client));
    for (const step of advance) {
      yield* TestClock.adjust(step);
      yield* Effect.yieldNow;
    }
    return yield* Fiber.join(fiber);
  }).pipe(Effect.provide(TestClock.layer()));

Deno.test("ModelClient.callModelStructured -- parses the first reply", async () => {
  const { client } = createSpyClient([
    { text: '{"ok":true}', reasoning: "because" },
  ]);

  const result = await Effect.runPromise(
    provideWith(structured(Schema.Struct({ ok: Schema.Boolean })), client),
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
    provideWith(structured(Schema.Struct({ ok: Schema.Boolean })), client),
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
      Effect.result(structured(Schema.Struct({ ok: Schema.Boolean }))),
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

Deno.test("ModelClient.callModelStructured -- a transient failure is re-issued one second later", async () => {
  const abort = new Error(
    'Response failed: {"code":"server_error","message":"The operation was aborted"}',
  );
  const { client, inputs } = createSpyClient([
    { text: '{"ok":true}', failWith: abort },
    { text: '{"ok":true}' },
  ]);

  const result = await Effect.runPromise(
    runClock(structured(Schema.Struct({ ok: Schema.Boolean })), client, [
      ROUND_RETRY_DELAY_MS,
    ]),
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
    runClock(
      structured(Schema.Struct({ ok: Schema.Boolean }), {
        onRetry: (failure) => retries.push(failure),
      }),
      client,
      [ROUND_RETRY_DELAY_MS],
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

Deno.test("ModelClient.callModelStructured -- a transient failure gives up after three attempts, spaced linearly", async () => {
  const abort = new Error("fetch failed");
  const { client, inputs } = createSpyClient([
    { text: '{"ok":true}', failWith: abort },
  ]);

  const outcome = await Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        provideWith(
          Effect.result(structured(Schema.Struct({ ok: Schema.Boolean }))),
          client,
        ),
      );
      yield* Effect.yieldNow;
      // The first attempt has dispatched and failed; the retry sleeps one
      // full second.
      assertEquals(inputs.length, 1);
      yield* TestClock.adjust(Duration.millis(ROUND_RETRY_DELAY_MS - 1));
      yield* Effect.yieldNow;
      assertEquals(inputs.length, 1);
      // One more millisecond fires the second attempt, which sleeps two
      // seconds.
      yield* TestClock.adjust(Duration.millis(1));
      yield* Effect.yieldNow;
      assertEquals(inputs.length, 2);
      yield* TestClock.adjust(Duration.millis(2 * ROUND_RETRY_DELAY_MS - 1));
      yield* Effect.yieldNow;
      assertEquals(inputs.length, 2);
      yield* TestClock.adjust(Duration.millis(1));
      yield* Effect.yieldNow;
      // The third attempt fails and the retries are exhausted.
      assertEquals(inputs.length, 3);
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  assert(Result.isFailure(outcome), "exhausted retries must fail");
  if (Result.isFailure(outcome)) {
    assert(outcome.failure instanceof ModelCallError, "the model error type");
  }
});

Deno.test("ModelClient.callModelStructured -- a deterministic failure is not retried", async () => {
  const { client, inputs } = createSpyClient([
    { text: '{"ok":true}', failWith: new SyntaxError("Unexpected token") },
  ]);

  await Effect.runPromise(
    provideWith(
      Effect.result(structured(Schema.Struct({ ok: Schema.Boolean }))),
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
    runClock(structured(Schema.Struct({ ok: Schema.Boolean })), client, [
      ROUND_RETRY_DELAY_MS,
    ]),
  );

  // One repair prompt, then two attempts at the same re-ask.
  assertEquals(inputs.length, 3);
  assertEquals(inputs[1], inputs[2]);
  assertEquals(inputs[1].includes("not json at all"), true);
  assertEquals(result.output, { ok: true });
  assertEquals(result.repairs.length, 1);
});
