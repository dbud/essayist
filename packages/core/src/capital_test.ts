import { assertEquals } from "@std/assert";
import { getCapital } from "./capital.ts";
import type { Agent } from "./agent.ts";
import { z } from "zod";

const testSchema = z.object({
  success: z.boolean(),
  result: z.string().nullable(),
  diagnostic: z.string(),
});

type TestResponse = z.output<typeof testSchema>;

function createMockClient(
  response: TestResponse,
  onCall?: (input: string) => void,
): Agent {
  return {
    callModel: (input: string, _schema: z.ZodObject<z.ZodRawShape>) => {
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
