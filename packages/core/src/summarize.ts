import type { Agent } from "./agent.ts";
import { createReadFileTool } from "./tools.ts";
import type { Tool } from "@openrouter/agent";

export async function summarizeFile(
  fileName: string,
  client: Agent,
  files: Map<string, string>,
): Promise<string> {
  const readTool = createReadFileTool(files) as Tool;

  return await client.callModelWithTools(
    `Summarize the file "${fileName}" in 2-3 sentences. ` +
      `Use the read_file tool to get the file contents first, then provide your summary.`,
    [readTool] as const,
  );
}
