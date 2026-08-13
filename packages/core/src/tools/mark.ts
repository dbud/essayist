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
    .describe("Optional short label; must be one of the allowed labels."),
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
  error: z
    .string()
    .optional()
    .describe("Present when the mark could not be created."),
});

export type MarkInput = z.infer<typeof inputSchema>;
export type MarkOutput = z.infer<typeof outputSchema>;

/** Options for createMarkTool. */
export interface MarkToolOptions {
  /** Allowed label values. */
  allowedLabels?: string[];
  /** Instruction text; overrides the default. */
  instruction?: string;
}

const DEFAULT_INSTRUCTION =
  "Use the mark tool to annotate a text span in a file with a comment. " +
  "Read the file first to get the exact text.";

const DEFAULT_DESCRIPTION =
  "Place a mark (annotation) on a text span in a file. " +
  "Returns a mark_id and thread_id. " +
  "If selected_text appears multiple times, use line_hint to specify which occurrence.";

export function createMarkTool(
  vfs: VFS,
  options?: MarkToolOptions,
): ToolPrompt {
  const allowedLabels = options?.allowedLabels;
  const instruction = options?.instruction ?? DEFAULT_INSTRUCTION;
  const description =
    allowedLabels && allowedLabels.length > 0
      ? `${DEFAULT_DESCRIPTION} Allowed labels: ${allowedLabels.join(", ")}.`
      : DEFAULT_DESCRIPTION;

  return {
    instruction,
    tool: tool({
      name: "mark",
      description,
      inputSchema,
      outputSchema,
      execute: async ({
        path,
        selected_text,
        comment,
        label,
        line_hint,
      }): Promise<MarkOutput> => {
        if (
          allowedLabels &&
          allowedLabels.length > 0 &&
          label !== undefined &&
          !allowedLabels.includes(label)
        ) {
          return {
            mark_id: "",
            thread_id: "",
            marked: false,
            error: `Label "${label}" is not allowed. Use one of: ${allowedLabels.join(", ")}.`,
          };
        }
        return await vfs.mark(path, selected_text, comment, {
          label,
          lineHint: line_hint,
        });
      },
    }),
  };
}
