import { assertEquals } from "@std/assert";
import { createWriteFileTool } from "./write_file.ts";
import { createMockVFS } from "./testing/mock_vfs.ts";
import type { ToolWithExecute } from "@openrouter/agent";

Deno.test("createWriteFileTool -- delegates to VFS and returns result", () => {
  const vfs = createMockVFS({
    write: () => ({ path: "f.txt", lines: 2, created: true }),
  });
  const { tool } = createWriteFileTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = fn.function.execute({
    path: "f.txt",
    content: "hello\nworld",
  }) as { created: boolean };

  assertEquals(result.created, true);
});

Deno.test("createWriteFileTool -- passes path and content to VFS", () => {
  let capturedPath = "";
  let capturedContent = "";
  const vfs = createMockVFS({
    write: (path: string, content: string) => {
      capturedPath = path;
      capturedContent = content;
      return { path, lines: 1, created: true };
    },
  });
  const { tool } = createWriteFileTool(vfs);
  const fn = tool as ToolWithExecute;

  fn.function.execute({ path: "notes/ideas.md", content: "new idea" });

  assertEquals(capturedPath, "notes/ideas.md");
  assertEquals(capturedContent, "new idea");
});

Deno.test("createWriteFileTool -- has correct schema and instruction", () => {
  const vfs = createMockVFS();
  const { tool, instruction } = createWriteFileTool(vfs);
  const fn = tool as ToolWithExecute;

  assertEquals(fn.type, "function");
  assertEquals(fn.function.name, "write_file");
  assertEquals(
    fn.function.description,
    "Create or overwrite a file with the given content. " +
      "If the file already exists, the previous version is automatically " +
      "snapshotted for version history. Returns whether the file was newly created.",
  );
  assertEquals(
    instruction,
    "Use the write_file tool to create or overwrite a file. " +
      "The previous version will be automatically saved for version history.",
  );
});
