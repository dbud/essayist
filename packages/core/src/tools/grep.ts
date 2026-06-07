import { tool } from "@openrouter/agent";
import { z } from "zod";
import type { ToolPrompt } from "./index.ts";
import type { VFS } from "../vfs/types.ts";

const inputSchema = z.object({
  pattern: z.string().describe(
    "The regex pattern to search for. Supports standard regex syntax.",
  ),
  options: z.object({
    path: z.string().optional().describe(
      "Optional file path to search in. If omitted, searches all files.",
    ),
    case_sensitive: z.boolean().optional().describe(
      "If true, the search is case-sensitive. Defaults to false.",
    ),
    max_results: z.number().optional().describe(
      "Maximum number of matches to return. Defaults to 50.",
    ),
  }).optional().describe("Optional search options"),
});

const outputSchema = z.object({
  matches: z.array(
    z.object({
      path: z.string().describe("File path where the match was found"),
      line_number: z.number().describe("Line number of the match (1-based)"),
      line: z.string().describe("The full line containing the match"),
      before: z.array(z.string()).describe(
        "Up to 2 lines before the match for context",
      ),
      after: z.array(z.string()).describe(
        "Up to 2 lines after the match for context",
      ),
    }),
  ).describe("Array of matches found"),
});

export type GrepInput = z.infer<typeof inputSchema>;
export type GrepOutput = z.infer<typeof outputSchema>;

export function createGrepTool(vfs: VFS): ToolPrompt {
  return {
    instruction:
      "Use the grep tool to search for text patterns across files. " +
      "Supports regex patterns. Use options.path to search a specific file, " +
      "or omit it to search all files.",
    tool: tool({
      name: "grep",
      description:
        "Search for a regex pattern across files. Returns matching lines " +
        "with file path, line number, and surrounding context. " +
        "Case-insensitive by default.",
      inputSchema,
      outputSchema,
      execute: ({ pattern, options }): GrepOutput => {
        return vfs.grep(pattern, options);
      },
    }),
  };
}
