import { tool } from "@openrouter/agent";
import type { z } from "zod";
import type { ToolPrompt } from "./index.ts";

export interface ToolDefinition<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  /** Prose the runner prepends to the model input when the tool is enabled. */
  instruction: string;
  inputSchema: S;
  outputSchema: z.ZodType;
}

/** Build a ToolPrompt from a definition. */
export function defineTool<S extends z.ZodObject>(
  {
    name,
    description,
    instruction,
    inputSchema,
    outputSchema,
  }: ToolDefinition<S>,
  execute: (input: z.output<S>) => Promise<unknown>,
): ToolPrompt {
  return {
    instruction,
    tool: tool({
      name,
      description,
      inputSchema,
      outputSchema,
      execute: (input) => execute(input),
    }),
  };
}
