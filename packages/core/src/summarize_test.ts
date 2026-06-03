import { assertEquals } from "@std/assert";
import { summarizeFile } from "./summarize.ts";
import type { Agent } from "./agent.ts";

function createMockAgentWithTools(
  responseText: string,
  onCall?: (input: string, tools: unknown) => void,
): Agent {
  return {
    callModelWithTools: (input: string, tools: unknown) => {
      onCall?.(input, tools);
      return Promise.resolve(responseText);
    },
  } as unknown as Agent;
}

const sampleFiles = new Map<string, string>([
  [
    "essay.txt",
    "The quick brown fox jumps over the lazy dog. " +
    "This sentence contains every letter of the alphabet.",
  ],
]);

Deno.test("summarizeFile sends correct prompt and tools", async () => {
  let capturedInput = "";
  const agent = createMockAgentWithTools(
    "This is a pangram containing every letter.",
    (input) => {
      capturedInput = input;
    },
  );

  const result = await summarizeFile("essay.txt", agent, sampleFiles);

  assertEquals(result, "This is a pangram containing every letter.");
  assertEquals(
    capturedInput,
    'Summarize the file "essay.txt" in 2-3 sentences. ' +
      "Use the read_file tool to get the file contents first, then provide your summary.",
  );
});

Deno.test("summarizeFile passes a read_file tool", async () => {
  let capturedTools: unknown;
  const agent = createMockAgentWithTools(
    "Summary here.",
    (_input, tools) => {
      capturedTools = tools;
    },
  );

  await summarizeFile("essay.txt", agent, sampleFiles);

  const tools = capturedTools as { type: string; function: { name: string } }[];
  assertEquals(tools.length, 1);
  assertEquals(tools[0].type, "function");
  assertEquals(tools[0].function.name, "read_file");
});
