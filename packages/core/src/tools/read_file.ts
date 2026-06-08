import { tool } from "@openrouter/agent";
import { z } from "zod";
import type { ToolPrompt } from "./index.ts";
import type { VFS } from "@/vfs/types.ts";

const inputSchema = z.object({
  path: z.string().describe("The path of the file to read"),
  start_line: z.number().optional().describe(
    "First line to read (1-based, inclusive). Defaults to 1.",
  ),
  end_line: z.number().optional().describe(
    "Last line to read (1-based, inclusive). Defaults to the last line.",
  ),
  numbered: z.boolean().optional().describe(
    "If true, prefix each line with its line number for easy reference.",
  ),
});

const outputSchema = z.object({
  content: z.string().describe("The text content of the file"),
  total_lines: z.number().describe("Total number of lines in the file"),
  start_line: z.number().describe("First line that was returned (1-based)"),
  end_line: z.number().describe("Last line that was returned (1-based)"),
});

export type ReadFileInput = z.infer<typeof inputSchema>;
export type ReadFileOutput = z.infer<typeof outputSchema>;

export function createReadFileTool(vfs: VFS): ToolPrompt {
  return {
    instruction:
      "Use the read_file tool to read file contents before answering. " +
      "You can request a specific line range with start_line and end_line (1-based). " +
      "Use numbered=true to see line numbers for referencing specific lines.",
    tool: tool({
      name: "read_file",
      description:
        "Read the contents of a file by path. Returns the text content. " +
        "Supports optional line range (start_line/end_line, 1-based inclusive) " +
        "and optional line numbering for easy reference.",
      inputSchema,
      outputSchema,
      execute: ({ path, start_line, end_line, numbered }): ReadFileOutput => {
        return vfs.read(path, start_line, end_line, numbered);
      },
    }),
  };
}
