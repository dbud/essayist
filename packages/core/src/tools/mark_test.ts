import type { ToolWithExecute } from "@openrouter/agent";
import { assertEquals } from "@std/assert";
import { createMarkTool } from "./mark.ts";
import { createMockVFS } from "./testing/mock_vfs.ts";

Deno.test("createMarkTool -- delegates to VFS and returns result", async () => {
  const vfs = createMockVFS({
    mark: () => ({
      mark_id: "mark_123",
      thread_id: "thread_456",
      marked: true,
    }),
  });
  const { tool } = createMarkTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = (await fn.function.execute({
    path: "f.txt",
    selected_text: "hello",
    comment: "greeting",
  })) as { marked: boolean; mark_id: string };

  assertEquals(result.marked, true);
  assertEquals(result.mark_id, "mark_123");
});

Deno.test("createMarkTool -- passes options to VFS", async () => {
  let capturedOptions: unknown;
  const vfs = createMockVFS({
    mark: (_p: string, _s: string, _c: string, opts: unknown) => {
      capturedOptions = opts;
      return {
        mark_id: "m1",
        thread_id: "t1",
        marked: true,
      };
    },
  });
  const { tool } = createMarkTool(vfs);
  const fn = tool as ToolWithExecute;

  await fn.function.execute({
    path: "f.txt",
    selected_text: "hello",
    comment: "note",
    label: "todo",
    line_hint: 42,
  });

  assertEquals(capturedOptions, {
    label: "todo",
    lineHint: 42,
  });
});

Deno.test("createMarkTool -- omits options when not provided", async () => {
  let capturedOptions: unknown;
  const vfs = createMockVFS({
    mark: (_p: string, _s: string, _c: string, opts: unknown) => {
      capturedOptions = opts;
      return {
        mark_id: "m1",
        thread_id: "t1",
        marked: true,
      };
    },
  });
  const { tool } = createMarkTool(vfs);
  const fn = tool as ToolWithExecute;

  await fn.function.execute({
    path: "f.txt",
    selected_text: "hello",
    comment: "note",
  });

  assertEquals(capturedOptions, {
    label: undefined,
    lineHint: undefined,
  });
});

Deno.test("createMarkTool -- has correct schema and instruction", () => {
  const vfs = createMockVFS();
  const { tool, instruction } = createMarkTool(vfs);
  const fn = tool as ToolWithExecute;

  assertEquals(fn.type, "function");
  assertEquals(fn.function.name, "mark");
  assertEquals(
    fn.function.description,
    "Place a mark (annotation) on a text span in a file. " +
      "Returns a mark_id and thread_id. " +
      "If selected_text appears multiple times, use line_hint to specify which occurrence.",
  );
  assertEquals(
    instruction,
    "Use the mark tool to annotate a text span in a file with a comment. " +
      "Read the file first to get the exact text.",
  );
});

Deno.test("createMarkTool -- allowedLabels append to description and override instruction", () => {
  const vfs = createMockVFS();
  const { tool, instruction } = createMarkTool(vfs, {
    allowedLabels: ["thesis", "evidence"],
    instruction: "Mark it.",
  });
  const fn = tool as ToolWithExecute;

  assertEquals(
    fn.function.description,
    "Place a mark (annotation) on a text span in a file. " +
      "Returns a mark_id and thread_id. " +
      "If selected_text appears multiple times, use line_hint to specify which occurrence." +
      " Allowed labels: thesis, evidence.",
  );
  assertEquals(instruction, "Mark it.");
});

Deno.test("createMarkTool -- rejects disallowed label without calling VFS", async () => {
  let called = false;
  const vfs = createMockVFS({
    mark: () => {
      called = true;
      return { mark_id: "m", thread_id: "t", marked: true };
    },
  });
  const { tool } = createMarkTool(vfs, { allowedLabels: ["thesis"] });
  const fn = tool as ToolWithExecute;

  const result = (await fn.function.execute({
    path: "f.txt",
    selected_text: "hi",
    comment: "c",
    label: "bogus",
  })) as { marked: boolean; error?: string };

  assertEquals(result.marked, false);
  assertEquals(typeof result.error, "string");
  assertEquals(called, false);
});

Deno.test("createMarkTool -- allows a label in the allowed set", async () => {
  const vfs = createMockVFS({
    mark: () => ({ mark_id: "m", thread_id: "t", marked: true }),
  });
  const { tool } = createMarkTool(vfs, { allowedLabels: ["thesis"] });
  const fn = tool as ToolWithExecute;

  const result = (await fn.function.execute({
    path: "f.txt",
    selected_text: "hi",
    comment: "c",
    label: "thesis",
  })) as { marked: boolean };

  assertEquals(result.marked, true);
});
