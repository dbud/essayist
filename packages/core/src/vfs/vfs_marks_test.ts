import { assertEquals } from "@std/assert";
import { assertObjectMatch } from "@std/assert/object-match";
import { createFile, createVFS } from "./testing/helpers.ts";

// -- mark --

Deno.test("VFS.mark -- places a mark on selected text", async () => {
  const { vfs } = await createFile(
    "essay.txt",
    "The quick brown fox jumps over the lazy dog.",
  );
  const result = await vfs.mark("essay.txt", "quick brown", "nice phrase");

  assertEquals(result.marked, true);
  assertEquals(typeof result.mark_id, "string");
  assertEquals(typeof result.thread_id, "string");
});

Deno.test("VFS.mark -- returns marked false when text not found", async () => {
  const { vfs } = await createFile("f.txt", "hello world");
  const result = await vfs.mark("f.txt", "nonexistent", "comment");

  assertEquals(result.marked, false);
  assertEquals(result.mark_id, "");
});

Deno.test("VFS.mark -- returns marked false for empty file", async () => {
  const { vfs } = await createFile("f.txt", "");
  const result = await vfs.mark("f.txt", "anything", "comment");

  assertEquals(result.marked, false);
});

Deno.test("VFS.mark -- uses lineHint to disambiguate duplicates", async () => {
  const { vfs, versionId } = await createFile(
    "f.txt",
    "The cat sat on\nthe cat mat.",
  );

  const result = await vfs.mark("f.txt", "cat", "second cat", { lineHint: 2 });

  assertEquals(result.marked, true);
  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].offset, 19);
});

Deno.test("VFS.mark -- lineHint 1 targets first line", async () => {
  const { vfs, versionId } = await createFile(
    "f.txt",
    "alpha beta\ngamma delta",
  );

  await vfs.mark("f.txt", "alpha", "on line 1", { lineHint: 1 });

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].offset, 0);
});

Deno.test("VFS.mark -- lineHint beyond last line clamps to end", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hello");

  await vfs.mark("f.txt", "hello", "only line", { lineHint: 99 });

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].offset, 0);
});

Deno.test("VFS.mark -- lineHint with no newlines", async () => {
  const { vfs, versionId } = await createFile("f.txt", "single line content");

  await vfs.mark("f.txt", "line", "no newlines", { lineHint: 1 });

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].offset, 7);
});

Deno.test("VFS.mark -- accepts explicit threadId", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hello world");
  const result = await vfs.mark("f.txt", "hello", "greeting", {
    threadId: "thread-abc",
  });

  assertEquals(result.thread_id, "thread-abc");
  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks[0].thread_id, "thread-abc");
});

Deno.test("VFS.mark -- captures context around selection", async () => {
  // With no intervening word boundaries (a single long token run on each
  // side), the whole long word is included in full -- there is no cap, so a
  // pathological long token yields a large context.
  const content = `${"A".repeat(100)}TARGET${"B".repeat(100)}`;
  const { vfs, versionId } = await createFile("f.txt", content);
  await vfs.mark("f.txt", "TARGET", "middle");

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertObjectMatch(marks[0], {
    before_context: "A".repeat(100),
    after_context: "B".repeat(100),
  });
});

Deno.test("VFS.mark -- context snapped to word boundaries", async () => {
  // Small contextSpan so snapping is observable: before_context starts at a
  // word start, after_context ends at a word end, instead of an arbitrary char
  // window. Trailing punctuation after a word is not included.
  const content = "One. Two. MARK Three. Four.";
  const { vfs, versionId } = await createFile("f.txt", content);
  await vfs.mark("f.txt", "MARK", "snap", { contextSpan: 5 });

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertObjectMatch(marks[0], {
    before_context: "Two. ",
    after_context: " Three",
  });
});

Deno.test("VFS.mark -- context truncated at file boundaries", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hi world");
  await vfs.mark("f.txt", "hi", "at start");

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertObjectMatch(marks[0], {
    before_context: "",
    after_context: " world",
  });
});

Deno.test("VFS.mark -- uses custom contextSpan", async () => {
  // A larger span captures more words, confirming the option controls the
  // window (distinct from the contextSpan: 5 case above).
  const content = "One. Two. MARK Three. Four.";
  const { vfs, versionId } = await createFile("f.txt", content);
  await vfs.mark("f.txt", "MARK", "custom span", { contextSpan: 8 });

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 1);
  assertObjectMatch(marks[0], {
    before_context: "One. Two. ",
    after_context: " Three. Four",
  });
});

Deno.test("VFS.mark -- stores label when provided", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hello world");
  await vfs.mark("f.txt", "hello", "greeting", { label: "important" });

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

  await vfs.mark("f.txt", "quick", "adj");
  await vfs.mark("f.txt", "fox", "noun");

  const marks = await vfs.getMarks("f.txt", versionId);
  assertEquals(marks.length, 2);
  assertEquals(marks[0].selected_text, "quick");
  assertEquals(marks[1].selected_text, "fox");
});

// -- deleteMark --

Deno.test("VFS.deleteMark -- removes a mark", async () => {
  const { vfs, versionId } = await createFile("f.txt", "hello world");
  const result = await vfs.mark("f.txt", "hello", "greeting");

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
  const { vfs } = await createFile("f.txt", "hello world");

  await vfs.mark("f.txt", "hello", "greeting");
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
  const { vfs } = await createFile("f.txt", "hello world");

  await vfs.mark("f.txt", "world", "noun");
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
  const { vfs } = await createFile("f.txt", "hello world");

  await vfs.mark("f.txt", "world", "noun");
  await vfs.write("f.txt", "hello");

  const file = await vfs.read("f.txt");
  const marks = await vfs.getMarks("f.txt", file.version_id);

  assertEquals(marks.length, 1);
  assertEquals(marks[0].status, "stale");
});

Deno.test("VFS.write -- stale marks survive subsequent writes", async () => {
  const { vfs } = await createFile("f.txt", "hello world");

  await vfs.mark("f.txt", "world", "noun");
  await vfs.write("f.txt", "hello");

  const file2 = await vfs.read("f.txt");
  const marks2 = await vfs.getMarks("f.txt", file2.version_id);
  assertEquals(marks2.length, 1);
  assertEquals(marks2[0].status, "stale");

  await vfs.write("f.txt", "hello again");

  const file3 = await vfs.read("f.txt");
  const marks3 = await vfs.getMarks("f.txt", file3.version_id);
  assertEquals(marks3.length, 1);
  assertEquals(marks3[0].status, "stale");
});

Deno.test("VFS.write -- no marks to migrate on first write", async () => {
  const vfs = await createVFS();
  await vfs.write("f.txt", "hello");
  const file = await vfs.read("f.txt");
  assertEquals(file.lines, 1);
});

// -- mark migration on revert --

Deno.test("VFS.revert -- migrates marks through write", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "hello world");

  await vfs.mark("f.txt", "hello", "greeting");
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
