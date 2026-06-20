import type { Tool } from "@openrouter/agent";

/** A tool paired with an instruction that tells the model how/when to use it. */
export interface ToolPrompt {
  tool: Tool;
  instruction: string;
}

export { createGrepTool } from "./grep.ts";
export { createListFilesTool } from "./list_files.ts";
export { createMarkTool } from "./mark.ts";
export { createReadFileTool } from "./read_file.ts";
export { createWriteFileTool } from "./write_file.ts";
