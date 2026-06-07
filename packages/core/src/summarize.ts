import type { Agent } from "./agent.ts";
import { createReadFileTool } from "./tools/read_file.ts";
import type { VFS } from "./vfs/types.ts";

export async function summarizeFile(
  fileName: string,
  client: Agent,
  vfs: VFS,
): Promise<string> {
  const readToolPrompt = createReadFileTool(vfs);

  const result = client.callModelWithTools(
    `Summarize the file "${fileName}" in 2-3 sentences.`,
    [readToolPrompt],
  );
  return await result.getText();
}
