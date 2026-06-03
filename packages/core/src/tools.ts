import { tool } from "@openrouter/agent";
import type { Tool } from "@openrouter/agent";
import { z } from "zod";

const readFileInput = z.object({
  path: z.string().describe("The name or path of the file to read"),
});

const readFileOutput = z.object({
  content: z.string().describe("The full text content of the file"),
});

export type ReadFileInput = z.infer<typeof readFileInput>;
export type ReadFileOutput = z.infer<typeof readFileOutput>;

/** A tool paired with an instruction that tells the model how/when to use it. */
export interface ToolPrompt {
  tool: Tool;
  instruction: string;
}

/** Creates a read_file ToolPrompt backed by an in-memory file map. */
export function createReadFileTool(
  files: Map<string, string>,
): ToolPrompt {
  return {
    instruction:
      "Use the read_file tool to read file contents before answering.",
    tool: tool({
      name: "read_file",
      description:
        "Read the contents of a file by name. Returns the full text content, " +
        "or an error message if the file is not found.",
      inputSchema: readFileInput,
      outputSchema: readFileOutput,
      execute: ({ path }): ReadFileOutput => {
        const content = files.get(path);
        if (content === undefined) {
          return { content: `Error: file "${path}" not found` };
        }
        return { content };
      },
    }),
  };
}
