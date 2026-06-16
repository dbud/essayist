import { assertEquals } from "@std/assert";
import { assertObjectMatch } from "@std/assert/object-match";
import { createFile, createVFS } from "./testing/helpers.ts";

// -- mark --

Deno.test("VFS.mark -- places a mark on selected text", async () => {
  const { vfs, versionId } = await createFile(
    "essay.txt",
    "The quick brown fox jumps over the lazy dog.",
  );
  const result = await vfs.mark(
    "essay.txt",
    versionId,
    "quick brown",
    "nice phrase",
  );

  assertEquals(result.marked, true);
  assertEquals(typeof result.mark_id, "string");
  assertEquals(typeof result.thread_id, "string");
});

Deno.test("VFS.mark -- returns marked false when text not found", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hello world");
  const result = await vfs.mark(
    "f.txt",
    versionId,
    "nonexistent",
    "comment",
  );

  assertEquals(result.marked, false);
  assertEquals(result.mark_id, "");
});

Deno.test("VFS.mark -- returns marked false for empty file", async () => {
  const { vfs, versionId } = await createFile("f.txt", "");
  const result = await vfs.mark(
    "f.txt",
    versionId,
    "anything",
    "comment",
  );

  assertEquals(result.marked, false);
});

Deno.test("VFS.mark -- uses offsetHint to disambiguate duplicates", async () => {
  const { vfs, versionId } = await createFile(
    "f.txt",
    "The cat sat on the cat mat.",
  );

  const result = await vfs.mark(
    "f.txt",
    versionId,
    "cat",
    "second cat",
    { offsetHint: 20 },
  );

  assertEquals(result.marked, true);
  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].offset, 19);
});

Deno.test("VFS.mark -- accepts explicit threadId", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hello world");
  const result = await vfs.mark(
    "f.txt",
    versionId,
    "hello",
    "greeting",
    { threadId: "thread-abc" },
  );

  assertEquals(result.thread_id, "thread-abc");
  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks[0].thread_id, "thread-abc");
});

Deno.test("VFS.mark -- captures context around selection", async () => {
  const content = "A".repeat(100) + "TARGET" + "B".repeat(100);
  const { vfs, versionId } = await createFile("f.txt", content);
  await vfs.mark("f.txt", versionId, "TARGET", "middle");

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertObjectMatch(marks[0], {
    before_context: "A".repeat(60),
    after_context: "B".repeat(60),
  });
});

Deno.test("VFS.mark -- context truncated at file boundaries", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hi world");
  await vfs.mark("f.txt", versionId, "hi", "at start");

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertObjectMatch(marks[0], {
    before_context: "",
    after_context: " world",
  });
});

Deno.test("VFS.mark -- uses custom contextRadius", async () => {
  const content = "A".repeat(100) + "TARGET" + "B".repeat(100);
  const { vfs, versionId } = await createFile("f.txt", content);
  await vfs.mark("f.txt", versionId, "TARGET", "custom radius", {
    contextRadius: 10,
  });

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertObjectMatch(marks[0], {
    before_context: "A".repeat(10),
    after_context: "B".repeat(10),
  });
});

Deno.test("VFS.mark -- stores label when provided", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hello world");
  await vfs.mark("f.txt", versionId, "hello", "greeting", {
    label: "important",
  });

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks[0].label, "important");
});

// -- getMarks --

Deno.test("VFS.getMarks -- returns empty array when no marks", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hello world");
  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks, []);
});

Deno.test("VFS.getMarks -- returns all marks for a version", async () => {
  const { vfs, versionId } = await createFile(
    "f.txt",
    "The quick brown fox jumps over the lazy dog.",
  );

  await vfs.mark("f.txt", versionId, "quick", "adj");
  await vfs.mark("f.txt", versionId, "fox", "noun");

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 2);
  assertEquals(marks[0].selected_text, "quick");
  assertEquals(marks[1].selected_text, "fox");
});

// -- deleteMark --

Deno.test("VFS.deleteMark -- removes a mark", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hello world");
  const result = await vfs.mark(
    "f.txt",
    versionId,
    "hello",
    "greeting",
  );

  assertEquals(result.marked, true);
  const deleted = await vfs.deleteMark("f.txt", versionId, result.mark_id);
  assertEquals(deleted, true);

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 0);
});

Deno.test("VFS.deleteMark -- returns false for nonexistent mark", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hello world");
  const deleted = await vfs.deleteMark("f.txt", versionId, "no-such-mark");
  assertEquals(deleted, false);
});

// -- mark migration on write --

Deno.test("VFS.write -- migrates marks to new version when text unchanged", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "hello world");

  await vfs.mark("f.txt", v1, "hello", "greeting");
  await vfs.write("f.txt", "hello beautiful world");

  const file = await vfs.read("f.txt");
  const marks = await vfs.getMarks("f.txt", file.version_id);

  assertEquals(marks.length, 1);
  assertObjectMatch(marks[0], {
    selected_text: "hello",
    status: "resolved",
    offset: 0,
  });
});

Deno.test("VFS.write -- migrates marks with shifted offset", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "hello world");

  await vfs.mark("f.txt", v1, "world", "noun");
  await vfs.write("f.txt", "hello beautiful world");

  const file = await vfs.read("f.txt");
  const marks = await vfs.getMarks("f.txt", file.version_id);

  assertEquals(marks.length, 1);
  assertObjectMatch(marks[0], {
    selected_text: "world",
    offset: 16,
  });
});

Deno.test("VFS.write -- marks become stale when text is deleted", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "hello world");

  await vfs.mark("f.txt", v1, "world", "noun");
  await vfs.write("f.txt", "hello");

  const file = await vfs.read("f.txt");
  const marks = await vfs.getMarks("f.txt", file.version_id);

  assertEquals(marks.length, 1);
  assertEquals(marks[0].status, "stale");
});

Deno.test("VFS.write -- no marks to migrate on first write", async () => {
  const vfs = await createVFS();
  await vfs.write("f.txt", "hello");
  const file = await vfs.read("f.txt");
  assertEquals(file.lines, 1);
});

Deno.test("VFS.write -- marks from v1 not visible in v2 list before migration", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "hello world");

  await vfs.mark("f.txt", v1, "hello", "greeting");
  await vfs.write("f.txt", "hello world again");

  const v1Marks = await vfs.getMarks("f.txt", v1);
  assertEquals(v1Marks.length, 1);

  const file = await vfs.read("f.txt");
  const v2Marks = await vfs.getMarks("f.txt", file.version_id);
  assertEquals(v2Marks.length, 1);

  assertEquals(v1Marks[0].id !== v2Marks[0].id, true);
});

// -- mark migration on revert --

Deno.test("VFS.revert -- migrates marks through write", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "hello world");

  await vfs.mark("f.txt", v1, "hello", "greeting");
  await vfs.write("f.txt", "goodbye world");
  await vfs.revert("f.txt", v1);

  const file = await vfs.read("f.txt");
  const marks = await vfs.getMarks("f.txt", file.version_id);
  assertEquals(marks.length, 1);
  assertObjectMatch(marks[0], {
    selected_text: "hello",
    status: "resolved",
  });
});
