import type { Agent } from "./agent.ts";
import { createReadFileTool } from "./tools.ts";

export async function summarizeFile(
  fileName: string,
  client: Agent,
  files: Map<string, string>,
): Promise<string> {
  const readToolPrompt = createReadFileTool(files);

  return await client.callModelWithTools(
    `Summarize the file "${fileName}" in 2-3 sentences.`,
    [readToolPrompt],
  );
}
