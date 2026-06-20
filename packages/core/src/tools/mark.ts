import { tool } from "@openrouter/agent";
import { z } from "zod";
import type { VFS } from "@/vfs/types.ts";
import type { ToolPrompt } from "./index.ts";

const inputSchema = z.object({
  path: z.string().describe("The path of the file to mark"),
  selected_text: z
    .string()
    .describe(
      "The exact text span to mark. Must match the file content exactly. " +
        "If the text appears multiple times, use line_hint to disambiguate.",
    ),
  comment: z.string().describe("The comment or note to attach to this mark."),
  label: z
    .string()
    .optional()
    .describe(
      "Optional short label for categorizing this mark (e.g. 'todo', 'question', 'suggestion').",
    ),
  line_hint: z
    .number()
    .optional()
    .describe(
      "Optional 1-based line number to disambiguate when selected_text appears multiple times. " +
        "Use the line number from a numbered read_file output.",
    ),
});

const outputSchema = z.object({
  mark_id: z.string().describe("Unique ID of the created mark."),
  thread_id: z
    .string()
    .describe("Stable thread ID for tracking this mark across versions."),
  marked: z
    .boolean()
    .describe(
      "True if the mark was created successfully, false if the text was not found.",
    ),
});

export type MarkInput = z.infer<typeof inputSchema>;
export type MarkOutput = z.infer<typeof outputSchema>;

export function createMarkTool(vfs: VFS): ToolPrompt {
  return {
    instruction:
      "Use the mark tool to annotate a text span in a file with a comment. " +
      "Read the file first to get the exact text.",
    tool: tool({
      name: "mark",
      description:
        "Place a mark (annotation) on a text span in a file. " +
        "Returns a mark_id and thread_id. " +
        "If selected_text appears multiple times, use line_hint to specify which occurrence.",
      inputSchema,
      outputSchema,
      execute: async ({
        path,
        selected_text,
        comment,
        label,
        line_hint,
      }): Promise<MarkOutput> => {
        return await vfs.mark(path, selected_text, comment, {
          label,
          lineHint: line_hint,
        });
      },
    }),
  };
}
