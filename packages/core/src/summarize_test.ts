import { assertEquals } from "@std/assert";
import { summarizeFile } from "./summarize.ts";
import { InMemoryAdapter } from "./vfs/persistence.ts";
import { VirtualFileSystem } from "./vfs/vfs.ts";
import type { Agent } from "./agent.ts";
import type { ToolPrompt } from "./tools/index.ts";
import type { ToolWithExecute } from "@openrouter/agent";

function createMockAgentWithTools(
  responseText: string,
  onCall?: (input: string, toolPrompts: readonly ToolPrompt[]) => void,
): Agent {
  return {
    callModelWithTools: (input: string, toolPrompts: readonly ToolPrompt[]) => {
      onCall?.(input, toolPrompts);
      return { getText: () => Promise.resolve(responseText) };
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

const vfs = new VirtualFileSystem(new InMemoryAdapter(sampleFiles));

Deno.test("summarizeFile sends user prompt and tool prompts", async () => {
  let capturedInput = "";
  let capturedPrompts: readonly ToolPrompt[] = [];
  const agent = createMockAgentWithTools(
    "This is a pangram containing every letter.",
    (input, toolPrompts) => {
      capturedInput = input;
      capturedPrompts = toolPrompts;
    },
  );

  const result = await summarizeFile("essay.txt", agent, vfs);

  assertEquals(result, "This is a pangram containing every letter.");
  assertEquals(
    capturedInput,
    'Summarize the file "essay.txt" in 2-3 sentences.',
  );
  assertEquals(capturedPrompts.length, 1);
});

Deno.test("summarizeFile passes a read_file tool with instruction", async () => {
  let capturedPrompts: readonly ToolPrompt[] = [];
  const agent = createMockAgentWithTools(
    "Summary here.",
    (_input, toolPrompts) => {
      capturedPrompts = toolPrompts;
    },
  );

  await summarizeFile("essay.txt", agent, vfs);

  assertEquals(capturedPrompts.length, 1);
  const fn = capturedPrompts[0].tool as ToolWithExecute;
  assertEquals(fn.type, "function");
  assertEquals(fn.function.name, "read_file");
  assertEquals(
    capturedPrompts[0].instruction,
    "Use the read_file tool to read file contents before answering. " +
      "You can request a specific line range with start_line and end_line (1-based). " +
      "Use numbered=true to see line numbers for referencing specific lines.",
  );
});
