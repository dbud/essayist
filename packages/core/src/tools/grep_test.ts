import { assertEquals } from "@std/assert";
import { createGrepTool } from "./grep.ts";
import { createMockVFS } from "./testing/mock_vfs.ts";
import type { GrepMatch } from "../vfs/types.ts";
import type { ToolWithExecute } from "@openrouter/agent";

Deno.test("createGrepTool -- returns matches from VFS", () => {
  const matches: GrepMatch[] = [
    {
      path: "essay.txt",
      line_number: 3,
      line: "The quick brown fox",
      before: ["Line 1", "Line 2"],
      after: ["Line 4"],
    },
  ];
  const vfs = createMockVFS({ grep: () => ({ matches }) });
  const { tool } = createGrepTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = fn.function.execute({
    pattern: "fox",
    options: undefined,
  }) as { matches: GrepMatch[] };

  assertEquals(result.matches, matches);
});

Deno.test("createGrepTool -- passes pattern and options to VFS.grep", () => {
  let capturedPattern = "";
  let capturedOptions: unknown;
  const vfs = createMockVFS({
    grep: (pattern: string, options?: unknown) => {
      capturedPattern = pattern;
      capturedOptions = options;
      return { matches: [] };
    },
  });
  const { tool } = createGrepTool(vfs);
  const fn = tool as ToolWithExecute;

  fn.function.execute({
    pattern: "hello",
    options: { path: "notes/ideas.md", case_sensitive: true, max_results: 10 },
  });

  assertEquals(capturedPattern, "hello");
  assertEquals(capturedOptions, {
    path: "notes/ideas.md",
    case_sensitive: true,
    max_results: 10,
  });
});

Deno.test("createGrepTool -- works with no options", () => {
  let capturedOptions: unknown = "not-called";
  const vfs = createMockVFS({
    grep: (_pattern: string, options?: unknown) => {
      capturedOptions = options;
      return { matches: [] };
    },
  });
  const { tool } = createGrepTool(vfs);
  const fn = tool as ToolWithExecute;

  fn.function.execute({ pattern: "test", options: undefined });

  assertEquals(capturedOptions, undefined);
});

Deno.test("createGrepTool -- returns empty matches when nothing found", () => {
  const vfs = createMockVFS();
  const { tool } = createGrepTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = fn.function.execute({
    pattern: "nonexistent",
    options: undefined,
  }) as { matches: GrepMatch[] };

  assertEquals(result.matches, []);
});

Deno.test("createGrepTool -- has correct schema", () => {
  const vfs = createMockVFS();
  const { tool } = createGrepTool(vfs);
  const fn = tool as ToolWithExecute;

  assertEquals(fn.type, "function");
  assertEquals(fn.function.name, "grep");
  assertEquals(
    fn.function.description,
    "Search for a regex pattern across files. Returns matching lines " +
      "with file path, line number, and surrounding context. " +
      "Case-insensitive by default.",
  );
});

Deno.test("createGrepTool -- has instruction", () => {
  const vfs = createMockVFS();
  const { instruction } = createGrepTool(vfs);

  assertEquals(
    instruction,
    "Use the grep tool to search for text patterns across files. " +
      "Supports regex patterns. Use options.path to search a specific file, " +
      "or omit it to search all files.",
  );
});
