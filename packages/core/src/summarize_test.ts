import type { ToolWithExecute } from "@openrouter/agent";
import { assertEquals } from "@std/assert";
import type { Agent } from "./agent.ts";
import { summarizeFile } from "./summarize.ts";
import type { ToolPrompt } from "./tools/index.ts";
import { createMockVFS } from "./tools/testing/mock_vfs.ts";

function createMockAgentWithTools(
  responseText: string,
  onCall?: (input: string, toolPrompts: readonly ToolPrompt[]) => void,
): Agent {
  return {
    callModelWithTools: (input: string, toolPrompts: readonly ToolPrompt[]) => {
      onCall?.(input, toolPrompts);
      return {
        getText: () => Promise.resolve(responseText),
        getTextStream: async function* () {
          yield responseText;
        },
        getItemsStream: async function* () {},
        cancel: () => {},
      };
    },
  } as unknown as Agent;
}

const vfs = createMockVFS({
  read: () => ({
    version_id: "v1",
    timestamp: 1000,
    content:
      "The quick brown fox jumps over the lazy dog. " +
      "This sentence contains every letter of the alphabet.",
    lines: 1,
    start_line: 1,
    end_line: 1,
  }),
});

Deno.test("summarizeFile -- delegates to agent and returns result", async () => {
  const agent = createMockAgentWithTools("This is a pangram.");
  const result = await summarizeFile("essay.txt", agent, vfs);
  assertEquals(result, "This is a pangram.");
});

Deno.test("summarizeFile -- sends correct prompt and tool", async () => {
  let capturedInput = "";
  let capturedPrompts: readonly ToolPrompt[] = [];
  const agent = createMockAgentWithTools("Summary.", (input, toolPrompts) => {
    capturedInput = input;
    capturedPrompts = toolPrompts;
  });

  await summarizeFile("essay.txt", agent, vfs);

  assertEquals(
    capturedInput,
    'Summarize the file "essay.txt" in 2-3 sentences.',
  );
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
