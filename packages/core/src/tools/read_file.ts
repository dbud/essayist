import { tool } from "@openrouter/agent";
import { z } from "zod";
import type { ToolPrompt } from "./index.ts";

const input = z.object({
  path: z.string().describe("The name or path of the file to read"),
});

const output = z.object({
  content: z.string().describe("The full text content of the file"),
});

export type ReadFileInput = z.infer<typeof input>;
export type ReadFileOutput = z.infer<typeof output>;

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
      inputSchema: input,
      outputSchema: output,
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
