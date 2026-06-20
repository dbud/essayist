import { tool } from "@openrouter/agent";
import { z } from "zod";
import type { VFS } from "@/vfs/types.ts";
import type { ToolPrompt } from "./index.ts";

const inputSchema = z.object({
  path: z.string().describe("The path of the file to write"),
  content: z
    .string()
    .describe(
      "The full text content to write to the file. " +
        "This will create the file if it doesn't exist, or overwrite it if it does.",
    ),
});

const outputSchema = z.object({
  path: z.string().describe("The path that was written"),
  lines: z.number().describe("Number of lines in the written content"),
  created: z
    .boolean()
    .describe("True if the file was created, false if it was overwritten"),
});

export type WriteFileInput = z.infer<typeof inputSchema>;
export type WriteFileOutput = z.infer<typeof outputSchema>;

export function createWriteFileTool(vfs: VFS): ToolPrompt {
  return {
    instruction:
      "Use the write_file tool to create or overwrite a file. " +
      "The previous version will be automatically saved for version history.",
    tool: tool({
      name: "write_file",
      description:
        "Create or overwrite a file with the given content. " +
        "If the file already exists, the previous version is automatically " +
        "snapshotted for version history. Returns whether the file was newly created.",
      inputSchema,
      outputSchema,
      execute: async ({ path, content }): Promise<WriteFileOutput> => {
        return await vfs.write(path, content);
      },
    }),
  };
}
