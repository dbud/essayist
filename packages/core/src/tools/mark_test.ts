import type { ToolWithExecute } from "@openrouter/agent";
import { assertEquals } from "@std/assert";
import { createMarkTool } from "./mark.ts";
import { createMockVFS } from "./testing/mock_vfs.ts";

Deno.test("createMarkTool -- places a batch of marks via VFS", async () => {
  const marked: unknown[] = [];
  const vfs = createMockVFS({
    mark: (path: string, selectedText: string, comment: string) => {
      marked.push({ path, selectedText, comment });
      return {
        mark_id: `mark_${marked.length}`,
        thread_id: `thread_${marked.length}`,
        marked: true,
      };
    },
  });
  const { tool } = createMarkTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = (await fn.function.execute({
    path: "f.txt",
    marks: [
      { selected_text: "hello", comment: "greeting" },
      { selected_text: "world", comment: "ending", label: "todo" },
    ],
  })) as {
    results: Array<{ marked: boolean; mark_id: string; selected_text: string }>;
  };

  assertEquals(result.results.length, 2);
  assertEquals(result.results[0].marked, true);
  assertEquals(result.results[0].mark_id, "mark_1");
  assertEquals(result.results[1].mark_id, "mark_2");
  assertEquals(result.results[1].selected_text, "world");
  assertEquals(marked, [
    { path: "f.txt", selectedText: "hello", comment: "greeting" },
    { path: "f.txt", selectedText: "world", comment: "ending" },
  ]);
});

Deno.test("createMarkTool -- passes per-entry options to VFS", async () => {
  const capturedOptions: unknown[] = [];
  const vfs = createMockVFS({
    mark: (_p: string, _s: string, _c: string, opts: unknown) => {
      capturedOptions.push(opts);
      return { mark_id: "m1", thread_id: "t1", marked: true };
    },
  });
  const { tool } = createMarkTool(vfs);
  const fn = tool as ToolWithExecute;

  await fn.function.execute({
    path: "f.txt",
    marks: [
      { selected_text: "hello", comment: "note", label: "todo", line_hint: 42 },
      { selected_text: "world", comment: "note" },
    ],
  });

  assertEquals(capturedOptions, [
    { label: "todo", lineHint: 42 },
    { label: undefined, lineHint: undefined },
  ]);
});

Deno.test("createMarkTool -- rejected label fails one entry, others proceed", async () => {
  const markedTexts: string[] = [];
  const vfs = createMockVFS({
    mark: (_p: string, selectedText: string) => {
      markedTexts.push(selectedText);
      return { mark_id: "m", thread_id: "t", marked: true };
    },
  });
  const { tool } = createMarkTool(vfs, { allowedLabels: ["thesis"] });
  const fn = tool as ToolWithExecute;

  const result = (await fn.function.execute({
    path: "f.txt",
    marks: [
      { selected_text: "bad", comment: "c", label: "bogus" },
      { selected_text: "good", comment: "c", label: "thesis" },
    ],
  })) as {
    results: Array<{ marked: boolean; error?: string; selected_text: string }>;
  };

  assertEquals(result.results[0].marked, false);
  assertEquals(
    result.results[0].error,
    'Label "bogus" is not allowed. Use one of: thesis.',
  );
  assertEquals(result.results[0].selected_text, "bad");
  assertEquals(result.results[1].marked, true);
  assertEquals(markedTexts, ["good"]);
});

Deno.test("createMarkTool -- VFS failure surfaces per entry without throwing", async () => {
  const vfs = createMockVFS({
    mark: (_p: string, selectedText: string) => {
      if (selectedText === "missing") {
        return { mark_id: "", thread_id: "", marked: false };
      }
      return { mark_id: "m", thread_id: "t", marked: true };
    },
  });
  const { tool } = createMarkTool(vfs);
  const fn = tool as ToolWithExecute;

  const result = (await fn.function.execute({
    path: "f.txt",
    marks: [
      { selected_text: "missing", comment: "c" },
      { selected_text: "present", comment: "c" },
    ],
  })) as { results: Array<{ marked: boolean; mark_id: string }> };

  assertEquals(result.results[0].marked, false);
  assertEquals(result.results[0].mark_id, "");
  assertEquals(result.results[1].marked, true);
});

Deno.test("createMarkTool -- has correct schema and instruction", () => {
  const vfs = createMockVFS();
  const { tool, instruction } = createMarkTool(vfs);
  const fn = tool as ToolWithExecute;

  assertEquals(fn.type, "function");
  assertEquals(fn.function.name, "mark");
  assertEquals(
    fn.function.description,
    "Place one or more marks (annotations) on text spans in a file in a " +
      "single call. Returns a result per mark. If selected_text appears " +
      "multiple times, use line_hint to specify which occurrence.",
  );
  assertEquals(
    instruction,
    "After reading a file, place ALL of its annotations in a single mark call, " +
      "passing every mark in the marks array. Each mark needs the exact " +
      "selected_text from the file and a concise comment.",
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
    "Place one or more marks (annotations) on text spans in a file in a " +
      "single call. Returns a result per mark. If selected_text appears " +
      "multiple times, use line_hint to specify which occurrence." +
      " Allowed labels: thesis, evidence.",
  );
  assertEquals(instruction, "Mark it.");
});
