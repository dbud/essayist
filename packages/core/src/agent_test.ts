import type { ModelResult, RequestOptions, Tool } from "@openrouter/agent";
import { assertEquals, assertExists } from "@std/assert";
import { z } from "zod";
import { Agent, RETRY_OPTIONS } from "./agent.ts";

// A minimal ModelResult stand-in. logAgentResult iterates getItemsStream();
// callModel awaits getText(). Both are satisfied here.
function fakeResult(text: string): ModelResult<readonly Tool[]> {
  return {
    getText: () => Promise.resolve(text),
    getTextStream: async function* () {
      yield text;
    },
    getItemsStream: async function* () {},
    cancel: () => {},
  } as unknown as ModelResult<readonly Tool[]>;
}

function createSpyClient(): {
  client: unknown;
  calls: { options?: RequestOptions }[];
} {
  const calls: { options?: RequestOptions }[] = [];
  const client = {
    callModel: (_request: unknown, options?: RequestOptions) => {
      calls.push({ options });
      return fakeResult('{"ok":true}');
    },
  };
  return { client, calls };
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

Deno.test("Agent.callModel -- forwards RETRY_OPTIONS to the OpenRouter client", async () => {
  const { client, calls } = createSpyClient();
  const agent = new Agent("test-key", client as unknown as never);

  await agent.callModel("ping", z.object({ ok: z.boolean() }), ["m/a", "m/b"]);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].options, RETRY_OPTIONS);
});

Deno.test("Agent.callModelWithTools -- forwards RETRY_OPTIONS to the OpenRouter client", () => {
  const { client, calls } = createSpyClient();
  const agent = new Agent("test-key", client as unknown as never);

  agent.callModelWithTools("ping", [], ["m/a", "m/b"]);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].options, RETRY_OPTIONS);
});
