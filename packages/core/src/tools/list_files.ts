import { tool } from "@openrouter/agent";
import { z } from "zod";
import type { ToolPrompt } from "./index.ts";
import type { VFS } from "@/vfs/types.ts";

const inputSchema = z.object({
  prefix: z.string().optional().describe(
    "Optional path prefix to filter files (e.g. 'notes/' to list only files in the notes directory).",
  ),
});

const outputSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().describe("File path"),
      lines: z.number().describe("Number of lines in the file"),
    }),
  ).describe("List of files"),
});

export type ListFilesInput = z.infer<typeof inputSchema>;
export type ListFilesOutput = z.infer<typeof outputSchema>;

export function createListFilesTool(vfs: VFS): ToolPrompt {
  return {
    instruction:
      "Use the list_files tool to discover what files are available. " +
      "Use the prefix parameter to filter to a specific directory.",
    tool: tool({
      name: "list_files",
      description: "List all files in the virtual file system. " +
        "Optionally filter by path prefix to list files in a specific directory.",
      inputSchema,
      outputSchema,
      execute: async ({ prefix }): Promise<ListFilesOutput> => {
        return { files: await vfs.list(prefix) };
      },
    }),
  };
}
