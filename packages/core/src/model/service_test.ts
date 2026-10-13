import type { Service } from "@effect/ai-openrouter/OpenRouterClient";
import { assert, assertEquals } from "@std/assert";
import { Duration, Effect, Fiber, Result, Schema } from "effect";
import { TestClock } from "effect/testing";
import {
  authAiError,
  createFakeClient,
  type FakeRound,
  networkAiError,
} from "./fake_client.ts";
import {
  ModelCallError,
  type ModelCallRecord,
  ModelClient,
  type RepairAttempt,
  type RetryFailure,
  ROUND_RETRY_DELAY_MS,
  type StructuredCallOptions,
  StructuredParseError,
} from "./service.ts";

const provideWith = <A, E>(
  program: Effect.Effect<A, E, ModelClient>,
  client: Service,
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
 * the sleeps, and join, handing back the replayed prompts.
 */
const runClock = <A, E>(
  program: Effect.Effect<A, E, ModelClient>,
  rounds: FakeRound[],
  advance: Duration.Input[],
): Effect.Effect<{ result: A; inputs: string[] }, E> =>
  Effect.gen(function* () {
    const { client, inputs } = createFakeClient(rounds);
    const fiber = yield* Effect.forkChild(provideWith(program, client));
    for (const step of advance) {
      yield* TestClock.adjust(step);
      yield* Effect.yieldNow;
    }
    return { result: yield* Fiber.join(fiber), inputs };
  }).pipe(Effect.provide(TestClock.layer()));

Deno.test("ModelClient.callModelStructured -- parses the first reply", async () => {
  const { client } = createFakeClient([
    {
      text: '{"ok":true}',
      reasoning: "because",
      usage: { inputTokens: 3, outputTokens: 2, cachedTokens: 1 },
    },
  ]);
  const reasoning: string[] = [];
  const modelCalls: ModelCallRecord[] = [];

  const result = await Effect.runPromise(
    provideWith(
      structured(Schema.Struct({ ok: Schema.Boolean }), {
        onReasoning: (text) => reasoning.push(text),
        onModelCall: (call) => modelCalls.push(call),
      }),
      client,
    ),
  );

  assertEquals(result, { ok: true });
  assertEquals(reasoning, ["because"]);
  assertEquals(modelCalls.length, 1);
  assertEquals(modelCalls[0].usage, {
    inputTokens: 3,
    outputTokens: 2,
    cachedTokens: 1,
  });
});

Deno.test("ModelClient.callModelStructured -- an invalid reply triggers the re-ask", async () => {
  const { client, inputs } = createFakeClient([
    { text: "not json at all" },
    { text: '{"ok":true}' },
  ]);
  const repairs: RepairAttempt[] = [];
  const modelCalls: ModelCallRecord[] = [];

  const result = await Effect.runPromise(
    provideWith(
      structured(Schema.Struct({ ok: Schema.Boolean }), {
        onRepair: (repair) => repairs.push(repair),
        onModelCall: (call) => modelCalls.push(call),
      }),
      client,
    ),
  );

  assertEquals(inputs.length, 2);
  assertEquals(inputs[1].includes("not json at all"), true);
  assertEquals(result, { ok: true });
  assertEquals(repairs.length, 1);
  assertEquals(modelCalls.length, 2);
});

Deno.test("ModelClient.callModelStructured -- a second parse failure fails typed", async () => {
  const { client } = createFakeClient([
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
  const { result, inputs } = await Effect.runPromise(
    runClock(
      structured(Schema.Struct({ ok: Schema.Boolean })),
      [
        { text: '{"ok":true}', failWith: networkAiError("socket hang up") },
        {
          text: '{"ok":true}',
        },
      ],
      [ROUND_RETRY_DELAY_MS],
    ),
  );

  assertEquals(inputs.length, 2);
  // The retry is the same prompt, not a repair.
  assertEquals(inputs[0], inputs[1]);
  assertEquals(result, { ok: true });
});

Deno.test("ModelClient.callModelStructured -- a transient failure reports the retry", async () => {
  const retries: RetryFailure[] = [];

  await Effect.runPromise(
    runClock(
      structured(Schema.Struct({ ok: Schema.Boolean }), {
        onRetry: (failure) => retries.push(failure),
      }),
      [
        { text: '{"ok":true}', failWith: networkAiError("socket hang up") },
        {
          text: '{"ok":true}',
        },
      ],
      [ROUND_RETRY_DELAY_MS],
    ),
  );

  assertEquals(retries.length, 1);
  assertEquals(retries[0].attempt, 1);
  assert(retries[0].error.includes("socket hang up"), "the error report");
});

Deno.test("ModelClient.callModelStructured -- a transient failure gives up after three attempts, spaced linearly", async () => {
  const { client, inputs } = createFakeClient([
    { text: '{"ok":true}', failWith: networkAiError("socket hang up") },
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
  const { client, inputs } = createFakeClient([
    { text: '{"ok":true}', failWith: authAiError("invalid key") },
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
  const repairs: RepairAttempt[] = [];
  const { result, inputs } = await Effect.runPromise(
    runClock(
      structured(Schema.Struct({ ok: Schema.Boolean }), {
        onRepair: (repair) => repairs.push(repair),
      }),
      [
        { text: "not json at all" },
        { text: '{"ok":true}', failWith: networkAiError("socket hang up") },
        { text: '{"ok":true}' },
      ],
      [ROUND_RETRY_DELAY_MS],
    ),
  );

  // One repair prompt, then two attempts at the same re-ask.
  assertEquals(inputs.length, 3);
  assertEquals(inputs[1], inputs[2]);
  assertEquals(inputs[1].includes("not json at all"), true);
  assertEquals(result, { ok: true });
  assertEquals(repairs.length, 1);
});
