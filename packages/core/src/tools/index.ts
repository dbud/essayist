import type { Tool } from "@openrouter/agent";

/** A tool paired with an instruction that tells the model how/when to use it. */
export interface ToolPrompt {
  tool: Tool;
  instruction: string;
}

export { createReadFileTool } from "./read_file.ts";
