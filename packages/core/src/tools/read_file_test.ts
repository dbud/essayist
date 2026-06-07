import { assertEquals } from "@std/assert";
import { createReadFileTool } from "./read_file.ts";
import { InMemoryAdapter } from "../vfs/persistence.ts";
import { VirtualFileSystem } from "../vfs/vfs.ts";
import type { ToolWithExecute } from "@openrouter/agent";

function createVFS(files?: Map<string, string>): VirtualFileSystem {
  const adapter = new InMemoryAdapter();
  if (files) {
    for (const [path, content] of files) {
      adapter.set(`file:${path}`, content);
    }
  }
  return new VirtualFileSystem(adapter);
}

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

Deno.test("createReadFileTool -- returns content for existing file", async () => {
  const vfs = createVFS(sampleFiles);
  const { tool } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;
  const result = await fn.function.execute({ path: "essay.txt" }) as {
    content: string;
    total_lines: number;
  };
  assertEquals(
    result.content,
    "The quick brown fox jumps over the lazy dog. " +
      "This sentence contains every letter of the alphabet.",
  );
  assertEquals(result.total_lines, 1);
});

Deno.test("createReadFileTool -- returns empty for missing file", async () => {
  const vfs = createVFS(sampleFiles);
  const { tool } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;
  const result = await fn.function.execute({ path: "missing.txt" }) as {
    content: string;
    total_lines: number;
  };
  assertEquals(result.content, "");
  assertEquals(result.total_lines, 0);
});

Deno.test("createReadFileTool -- line range", async () => {
  const vfs = createVFS(new Map([["f.txt", "line1\nline2\nline3"]]));
  const { tool } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;
  const result = await fn.function.execute({
    path: "f.txt",
    start_line: 2,
    end_line: 3,
  }) as {
    content: string;
    total_lines: number;
    start_line: number;
    end_line: number;
  };
  assertEquals(result.content, "line2\nline3");
  assertEquals(result.total_lines, 3);
  assertEquals(result.start_line, 2);
  assertEquals(result.end_line, 3);
});

Deno.test("createReadFileTool -- numbered output", async () => {
  const vfs = createVFS(new Map([["f.txt", "alpha\nbeta\ngamma"]]));
  const { tool } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;
  const result = await fn.function.execute({
    path: "f.txt",
    numbered: true,
  }) as { content: string };
  const lines = result.content.split("\n");
  assertEquals(lines[0], "     1: alpha");
  assertEquals(lines[1], "     2: beta");
  assertEquals(lines[2], "     3: gamma");
});

Deno.test("createReadFileTool -- has correct schema", () => {
  const vfs = createVFS(sampleFiles);
  const { tool } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;
  assertEquals(fn.type, "function");
  assertEquals(fn.function.name, "read_file");
  assertEquals(
    fn.function.description,
    "Read the contents of a file by path. Returns the text content. " +
      "Supports optional line range (start_line/end_line, 1-based inclusive) " +
      "and optional line numbering for easy reference.",
  );
});

Deno.test("createReadFileTool -- has instruction", () => {
  const vfs = createVFS(sampleFiles);
  const { instruction } = createReadFileTool(vfs);
  assertEquals(
    instruction,
    "Use the read_file tool to read file contents before answering. " +
      "You can request a specific line range with start_line and end_line (1-based). " +
      "Use numbered=true to see line numbers for referencing specific lines.",
  );
});
