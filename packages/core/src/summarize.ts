import type { Agent } from "./agent.ts";
import { createReadFileTool } from "./tools/read_file.ts";

export async function summarizeFile(
  fileName: string,
  client: Agent,
  files: Map<string, string>,
): Promise<string> {
  const readToolPrompt = createReadFileTool(files);

  const result = client.callModelWithTools(
    `Summarize the file "${fileName}" in 2-3 sentences.`,
    [readToolPrompt],
  );
  return await result.getText();
}
