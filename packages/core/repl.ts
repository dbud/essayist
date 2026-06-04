/**
 * Interactive REPL for testing OpenRouter endpoints with tools.
 *
 * Usage:
 *   deno task -f core repl
 *
 * Type a prompt and press Enter. The response streams to your terminal.
 * Tool invocations and results are printed as they happen.
 * Type "exit" or Ctrl-D to quit.
 */

import { Agent } from "./mod.ts";
import { createReadFileTool } from "./src/tools/read_file.ts";

const API_KEY = Deno.env.get("OPENROUTER_API_KEY");
if (!API_KEY) {
  console.error(
    "OPENROUTER_API_KEY not set.\n" +
      "Create a .env file with OPENROUTER_API_KEY=sk-or-... to use the REPL.",
  );
  Deno.exit(1);
}

const agent = new Agent(API_KEY);

const sampleFiles = new Map<string, string>([
  [
    "essay.txt",
    "The quick brown fox jumps over the lazy dog. " +
    "This sentence contains every letter of the alphabet.",
  ],
  [
    "report.txt",
    "Q3 revenue grew 12% year-over-year. " +
    "Operating margins improved due to cost optimization.",
  ],
]);

const tools = [createReadFileTool(sampleFiles)];

console.log("Essayist REPL — type a prompt, or 'exit' to quit.\n");

while (true) {
  const input = prompt("> ");
  if (!input || input.trim().toLowerCase() === "exit") {
    console.log("Bye!");
    break;
  }

  console.log("");
  try {
    await agent.streamChat(input.trim(), tools);
  } catch (err) {
    console.error("Error:", err);
  }
  console.log("\n");
}
