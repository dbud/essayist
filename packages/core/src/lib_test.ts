import { assertEquals } from "jsr:@std/assert@^1";
import { getCapital } from "./lib.ts";
import type { Agent, ModelResponse } from "./agent.ts";

function createMockClient(
  response: ModelResponse,
  onCall?: (input: string) => void,
): Agent {
  return {
    callModel: (input: string) => {
      onCall?.(input);
      return Promise.resolve(response);
    },
  } as unknown as Agent;
}

Deno.test("getCapital sends the correct prompt", async () => {
  let capturedInput = "";
  const client = createMockClient(
    { success: true, result: "Paris", diagnostic: "Found capital" },
    (input) => {
      capturedInput = input;
    },
  );

  const result = await getCapital("France", client);

  assertEquals(result, "Paris");
  assertEquals(capturedInput, "What is the capital of France?");
});

Deno.test("getCapital throws on unsuccessful response", async () => {
  const client = createMockClient({
    success: false,
    result: "",
    diagnostic: "Could not determine capital",
  });

  let threw = false;
  try {
    await getCapital("UnknownCountry", client);
  } catch (err) {
    threw = true;
    assertEquals(
      (err as Error).message,
      "Model returned failure: Could not determine capital",
    );
  }
  assertEquals(threw, true);
});
