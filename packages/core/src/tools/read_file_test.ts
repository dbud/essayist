import { assertEquals } from "@std/assert";
import { createReadFileTool } from "./read_file.ts";
import { createMockVFS } from "./testing/mock_vfs.ts";
import type { ToolWithExecute } from "@openrouter/agent";

Deno.test("createReadFileTool -- delegates to VFS and returns result", async () => {
  const vfs = createMockVFS({
    read: () => ({
      content: "hello world",
      total_lines: 1,
      start_line: 1,
      end_line: 1,
    }),
  });
  const { tool } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = await fn.function.execute({ path: "f.txt" }) as {
    content: string;
  };

  assertEquals(result.content, "hello world");
});

Deno.test("createReadFileTool -- passes line range to VFS", async () => {
  let capturedArgs: unknown;
  const vfs = createMockVFS({
    read: (...args: unknown[]) => {
      capturedArgs = args;
      return { content: "", total_lines: 0, start_line: 0, end_line: 0 };
    },
  });
  const { tool } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;

  await fn.function.execute({ path: "f.txt", start_line: 2, end_line: 5 });

  assertEquals(capturedArgs, ["f.txt", 2, 5, undefined]);
});

Deno.test("createReadFileTool -- has correct schema and instruction", () => {
  const vfs = createMockVFS();
  const { tool, instruction } = createReadFileTool(vfs);
  const fn = tool as ToolWithExecute;

  assertEquals(fn.type, "function");
  assertEquals(fn.function.name, "read_file");
  assertEquals(
    fn.function.description,
    "Read the contents of a file by path. Returns the text content. " +
      "Supports optional line range (start_line/end_line, 1-based inclusive) " +
      "and optional line numbering for easy reference.",
  );
  assertEquals(
    instruction,
    "Use the read_file tool to read file contents before answering. " +
      "You can request a specific line range with start_line and end_line (1-based). " +
      "Use numbered=true to see line numbers for referencing specific lines.",
  );
});
