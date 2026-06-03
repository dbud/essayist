import { tool } from "@openrouter/agent";
import { z } from "zod";

const readFileInput = z.object({
  path: z.string().describe("The name or path of the file to read"),
});

const readFileOutput = z.object({
  content: z.string().describe("The full text content of the file"),
});

export type ReadFileInput = z.infer<typeof readFileInput>;
export type ReadFileOutput = z.infer<typeof readFileOutput>;

/**
 * Creates a read_file tool that returns file contents from an in-memory map.
 *
 * Uses the `tool()` helper from `@openrouter/agent` for full type inference.
 * The `execute` function receives typed params (`{ path: string }`) and the
 * SDK handles argument validation, execution, and feeding results back to the
 * model automatically.
 *
 * @param files - A map of file names to their text contents
 */
export function createReadFileTool(
  files: Map<string, string>,
) {
  return tool({
    name: "read_file",
    description:
      "Read the contents of a file by name. Returns the full text content, " +
      "or an error message if the file is not found.",
    inputSchema: readFileInput,
    outputSchema: readFileOutput,
    execute: ({ path }): ReadFileOutput => {
      console.log("TOOL CALLED", path);
      const content = files.get(path);
      if (content === undefined) {
        return { content: `Error: file "${path}" not found` };
      }
      return { content };
    },
  });
}
