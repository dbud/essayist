import { assertEquals } from "@std/assert";
import { createListFilesTool } from "./list_files.ts";
import { createMockVFS } from "./testing/mock_vfs.ts";
import type { FileEntry } from "../vfs/types.ts";
import type { ToolWithExecute } from "@openrouter/agent";

Deno.test("createListFilesTool -- returns files from VFS", () => {
  const files: FileEntry[] = [
    { path: "notes/ideas.md", lines: 10 },
    { path: "essay.txt", lines: 25 },
  ];
  const vfs = createMockVFS({ list: () => files });
  const { tool } = createListFilesTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = fn.function.execute({ prefix: undefined }) as {
    files: FileEntry[];
  };

  assertEquals(result.files, files);
});

Deno.test("createListFilesTool -- passes prefix to VFS.list", () => {
  let capturedPrefix: string | undefined;
  const vfs = createMockVFS({
    list: (prefix?: string) => {
      capturedPrefix = prefix;
      return [];
    },
  });
  const { tool } = createListFilesTool(vfs);
  const fn = tool as ToolWithExecute;

  fn.function.execute({ prefix: "notes/" });

  assertEquals(capturedPrefix, "notes/");
});

Deno.test("createListFilesTool -- returns empty array when no files", () => {
  const vfs = createMockVFS();
  const { tool } = createListFilesTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = fn.function.execute({ prefix: undefined }) as {
    files: FileEntry[];
  };

  assertEquals(result.files, []);
});

Deno.test("createListFilesTool -- has correct schema", () => {
  const vfs = createMockVFS();
  const { tool } = createListFilesTool(vfs);
  const fn = tool as ToolWithExecute;

  assertEquals(fn.type, "function");
  assertEquals(fn.function.name, "list_files");
  assertEquals(
    fn.function.description,
    "List all files in the virtual file system. " +
      "Optionally filter by path prefix to list files in a specific directory.",
  );
});

Deno.test("createListFilesTool -- has instruction", () => {
  const vfs = createMockVFS();
  const { instruction } = createListFilesTool(vfs);

  assertEquals(
    instruction,
    "Use the list_files tool to discover what files are available. " +
      "Use the prefix parameter to filter to a specific directory.",
  );
});
