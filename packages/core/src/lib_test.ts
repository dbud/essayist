import { assertEquals } from "jsr:@std/assert@^1";
import { getCapital } from "./lib.ts";
import type { Agent } from "./agent.ts";

function createMockClient(
  response: string,
  onCall?: (input: string) => void,
): Agent {
  return {
    callModel: (input) => {
      onCall?.(input);
      return { getText: () => Promise.resolve(response) } as ReturnType<
        Agent["callModel"]
      >;
    },
  } as Agent;
}

Deno.test("getCapital sends the correct prompt", async () => {
  let capturedInput = "";
  const client = createMockClient("Paris", (input) => {
    capturedInput = input;
  });

  const result = await getCapital("France", client);

  assertEquals(result, "Paris");
  assertEquals(
    capturedInput,
    "What is the capital of France? Respond with only the city name.",
  );
});
