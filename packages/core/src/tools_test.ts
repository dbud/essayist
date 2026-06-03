import { assertEquals } from "@std/assert";
import { createReadFileTool } from "./tools.ts";

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
  const tool = createReadFileTool(sampleFiles);  
  const result = await tool.function.execute({ path: "essay.txt" });
  assertEquals(
    result.content,
    "The quick brown fox jumps over the lazy dog. " +
      "This sentence contains every letter of the alphabet.",
  );
});

Deno.test("createReadFileTool returns error for missing file", async () => {
  const tool = createReadFileTool(sampleFiles);
  const result = await tool.function.execute({ path: "missing.txt" });
  assertEquals(result.content, 'Error: file "missing.txt" not found');
});

Deno.test("createReadFileTool has correct schema", () => {
  const tool = createReadFileTool(sampleFiles);
  assertEquals(tool.type, "function");
  assertEquals(tool.function.name, "read_file");
  assertEquals(
    tool.function.description,
    "Read the contents of a file by name. Returns the full text content, " +
      "or an error message if the file is not found.",
  );
});
