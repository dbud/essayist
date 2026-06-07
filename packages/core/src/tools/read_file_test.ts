import { assertEquals } from "@std/assert";
import { createReadFileTool } from "./read_file.ts";
import { createMockVFS } from "./testing/mock_vfs.ts";
import type { ReadResult } from "../vfs/types.ts";
import type { ToolWithExecute } from "@openrouter/agent";

Deno.test("createReadFileTool -- returns content for existing file", async () => {
  const vfs = createMockVFS({
    read: () => ({
      content: "The quick brown fox jumps over the lazy dog. " +
        "This sentence contains every letter of the alphabet.",
      total_lines: 1,
      start_line: 1,
      end_line: 1,
    }),
  });
  const { tool } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = await fn.function.execute({ path: "essay.txt" }) as {
    content: string;
    total_lines: number;
    start_line: number;
    end_line: number;
  };

  assertEquals(result, {
    content: "The quick brown fox jumps over the lazy dog. " +
      "This sentence contains every letter of the alphabet.",
    total_lines: 1,
    start_line: 1,
    end_line: 1,
  });
});

Deno.test("createReadFileTool -- returns empty for missing file", async () => {
  const vfs = createMockVFS();
  const { tool } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = await fn.function.execute({ path: "missing.txt" }) as {
    content: string;
    total_lines: number;
    start_line: number;
    end_line: number;
  };

  assertEquals(result, {
    content: "",
    total_lines: 0,
    start_line: 0,
    end_line: 0,
  });
});

Deno.test("createReadFileTool -- line range", async () => {
  const vfs = createMockVFS({
    read: (): ReadResult => ({
      content: "line2\nline3",
      total_lines: 3,
      start_line: 2,
      end_line: 3,
    }),
  });
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

  assertEquals(result, {
    content: "line2\nline3",
    total_lines: 3,
    start_line: 2,
    end_line: 3,
  });
});

Deno.test("createReadFileTool -- numbered output", async () => {
  const vfs = createMockVFS({
    read: (): ReadResult => ({
      content: "     1: alpha\n     2: beta\n     3: gamma",
      total_lines: 3,
      start_line: 1,
      end_line: 3,
    }),
  });
  const { tool } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = await fn.function.execute({
    path: "f.txt",
    numbered: true,
  }) as { content: string };

  assertEquals(result.content.split("\n"), [
    "     1: alpha",
    "     2: beta",
    "     3: gamma",
  ]);
});

Deno.test("createReadFileTool -- has correct schema", () => {
  const vfs = createMockVFS();
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
  const vfs = createMockVFS();
  const { instruction } = createReadFileTool(vfs);

  assertEquals(
    instruction,
    "Use the read_file tool to read file contents before answering. " +
      "You can request a specific line range with start_line and end_line (1-based). " +
      "Use numbered=true to see line numbers for referencing specific lines.",
  );
});
