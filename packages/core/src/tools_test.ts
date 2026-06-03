import { assertEquals } from "@std/assert";
import { createReadFileTool } from "./tools.ts";
import type { ToolWithExecute } from "@openrouter/agent";

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

Deno.test("createReadFileTool returns content for existing file", async () => {
  const { tool } = createReadFileTool(sampleFiles);
  const fn = tool as ToolWithExecute;
  const result = await fn.function.execute({ path: "essay.txt" }) as {
    content: string;
  };
  assertEquals(
    result.content,
    "The quick brown fox jumps over the lazy dog. " +
      "This sentence contains every letter of the alphabet.",
  );
});

Deno.test("createReadFileTool returns error for missing file", async () => {
  const { tool } = createReadFileTool(sampleFiles);
  const fn = tool as ToolWithExecute;
  const result = await fn.function.execute({ path: "missing.txt" }) as {
    content: string;
  };
  assertEquals(result.content, 'Error: file "missing.txt" not found');
});

Deno.test("createReadFileTool has correct schema", () => {
  const { tool } = createReadFileTool(sampleFiles);
  const fn = tool as ToolWithExecute;
  assertEquals(fn.type, "function");
  assertEquals(fn.function.name, "read_file");
  assertEquals(
    fn.function.description,
    "Read the contents of a file by name. Returns the full text content, " +
      "or an error message if the file is not found.",
  );
});

Deno.test("createReadFileTool has instruction", () => {
  const { instruction } = createReadFileTool(sampleFiles);
  assertEquals(
    instruction,
    "Use the read_file tool to read file contents before answering.",
  );
});
