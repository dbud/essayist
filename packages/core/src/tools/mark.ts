import { tool } from "@openrouter/agent";
import { z } from "zod";
import type { VFS } from "@/vfs/types.ts";
import type { ToolPrompt } from "./index.ts";

const markSchema = z.object({
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

const inputSchema = z.object({
  path: z.string().describe("The path of the file to mark"),
  marks: z.array(markSchema).min(1).describe("All marks to place in the file."),
});

const outputSchema = z.object({
  results: z.array(
    z.object({
      selected_text: z
        .string()
        .describe("The text span this result belongs to."),
      mark_id: z
        .string()
        .describe("Unique ID of the created mark, empty when not marked."),
      thread_id: z
        .string()
        .describe("Stable thread ID for tracking, empty when not marked."),
      marked: z
        .boolean()
        .describe("True if the mark was created successfully."),
      error: z
        .string()
        .optional()
        .describe("Present when the mark could not be created."),
    }),
  ),
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
  "After reading a file, place ALL of its annotations in a single mark call, " +
  "passing every mark in the marks array. Each mark needs the exact " +
  "selected_text from the file and a concise comment.";

const DEFAULT_DESCRIPTION =
  "Place one or more marks (annotations) on text spans in a file in a " +
  "single call. Returns a result per mark. If selected_text appears " +
  "multiple times, use line_hint to specify which occurrence.";

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
      execute: async ({ path, marks }): Promise<MarkOutput> => {
        const results = [];
        for (const mark of marks) {
          if (
            allowedLabels &&
            allowedLabels.length > 0 &&
            mark.label !== undefined &&
            !allowedLabels.includes(mark.label)
          ) {
            results.push({
              selected_text: mark.selected_text,
              mark_id: "",
              thread_id: "",
              marked: false,
              error: `Label "${mark.label}" is not allowed. Use one of: ${allowedLabels.join(", ")}.`,
            });
            continue;
          }
          const result = await vfs.mark(
            path,
            mark.selected_text,
            mark.comment,
            {
              label: mark.label,
              lineHint: mark.line_hint,
            },
          );
          results.push({ selected_text: mark.selected_text, ...result });
        }
        return { results };
      },
    }),
  };
}
