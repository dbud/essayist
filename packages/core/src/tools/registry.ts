import { z } from "zod";
import type { ToolDefinition } from "./define.ts";
import { grepDefinition } from "./grep.ts";
import { listFilesDefinition } from "./list_files.ts";
import { markDefinition } from "./mark.ts";
import { readFileDefinition } from "./read_file.ts";
import { writeFileDefinition } from "./write_file.ts";

export type ToolParameters = Record<string, unknown>;

export interface ToolInfo {
  name: string;
  description: string;
  instruction: string;
  parameters: ToolParameters;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  readFileDefinition,
  listFilesDefinition,
  grepDefinition,
  markDefinition,
  writeFileDefinition,
];

/** zod input schema to the JSON Schema the model receives. */
function toParameters(schema: z.ZodType): ToolParameters {
  // Same target as the SDK's tool wire conversion.
  return z.toJSONSchema(schema, { target: "draft-7" }) as Record<
    string,
    unknown
  >;
}

/** Reference info for every tool available to review passes. */
export function getToolInfos(): ToolInfo[] {
  return TOOL_DEFINITIONS.map(
    ({ name, description, instruction, inputSchema }) => ({
      name,
      description,
      instruction,
      parameters: toParameters(inputSchema),
    }),
  );
}
