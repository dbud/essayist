import { assertEquals } from "@std/assert";
import { createVFS } from "./testing/helpers.ts";

const sampleEssay = [
  "The quick brown fox jumps over the lazy dog.",
  "This sentence contains every letter of the alphabet.",
  "It has been used as a typing test since the late 1800s.",
  "The fox was quick, the dog was lazy, and the sentence was perfect.",
].join("\n");

// Read

Deno.test("VFS.read -- full file (latest)", async () => {
  const vfs = await createVFS(new Map([["essay.txt", sampleEssay]]));
  const result = await vfs.read("essay.txt");
  assertEquals(result.content, sampleEssay);
  assertEquals(result.lines, 4);
  assertEquals(result.start_line, 1);
  assertEquals(result.end_line, 4);
});

Deno.test("VFS.read -- line range", async () => {
  const vfs = await createVFS(new Map([["essay.txt", sampleEssay]]));
  const result = await vfs.read("essay.txt", { startLine: 2, endLine: 3 });
  assertEquals(result.content, sampleEssay.split("\n").slice(1, 3).join("\n"));
  assertEquals(result.lines, 4);
  assertEquals(result.start_line, 2);
  assertEquals(result.end_line, 3);
});

Deno.test("VFS.read -- numbered output", async () => {
  const vfs = await createVFS(new Map([["essay.txt", sampleEssay]]));
  const result = await vfs.read("essay.txt", {
    startLine: 1,
    endLine: 2,
    numbered: true,
  });
  assertEquals(result.content.split("\n"), [
    "     1: The quick brown fox jumps over the lazy dog.",
    "     2: This sentence contains every letter of the alphabet.",
  ]);
});

Deno.test("VFS.read -- missing file returns empty", async () => {
  const vfs = await createVFS();
  const result = await vfs.read("missing.txt");
  assertEquals(result.content, "");
  assertEquals(result.lines, 0);
});

Deno.test("VFS.read -- clamps line range", async () => {
  const vfs = await createVFS(new Map([["essay.txt", sampleEssay]]));
  const result = await vfs.read("essay.txt", { startLine: -5, endLine: 100 });
  assertEquals(result.start_line, 1);
  assertEquals(result.end_line, 4);
});

Deno.test("VFS.read -- specific version", async () => {
  const vfs = await createVFS(new Map([["f.txt", "original"]]));
  await vfs.write("f.txt", "modified");
  const history = await vfs.getHistory("f.txt");
  assertEquals(history.length, 2);
  const original = await vfs.read("f.txt", {
    versionId: history[0].version_id,
  });
  assertEquals(original.content, "original");
  const latest = await vfs.read("f.txt", { versionId: history[1].version_id });
  assertEquals(latest.content, "modified");
});

// Write

Deno.test("VFS.write -- creates new file", async () => {
  const vfs = await createVFS();
  const result = await vfs.write("new.txt", "hello\nworld");
  assertEquals(result, { created: true, lines: 2, path: "new.txt" });
});

Deno.test("VFS.write -- overwrites existing file", async () => {
  const vfs = await createVFS(new Map([["f.txt", "old"]]));
  const result = await vfs.write("f.txt", "new content");
  assertEquals(result.created, false);
  assertEquals(result.lines, 1);
});

Deno.test("VFS.write -- creates version snapshot", async () => {
  const vfs = await createVFS(new Map([["f.txt", "version1"]]));
  await vfs.write("f.txt", "version2");
  const history = await vfs.getHistory("f.txt");
  assertEquals(history.length, 2);
});

Deno.test("VFS.write -- first write also creates a version", async () => {
  const vfs = await createVFS();
  await vfs.write("f.txt", "hello");
  const history = await vfs.getHistory("f.txt");
  assertEquals(history.length, 1);
});

// List

Deno.test("VFS.list -- all files", async () => {
  const vfs = await createVFS(
    new Map([
      ["a.txt", "line1"],
      ["b.txt", "line1\nline2"],
      ["c.md", "x\ny\nz"],
    ]),
  );
  const files = await vfs.list();
  assertEquals(files, [
    { path: "a.txt", lines: 1 },
    { path: "b.txt", lines: 2 },
    { path: "c.md", lines: 3 },
  ]);
});

Deno.test("VFS.list -- with prefix", async () => {
  const vfs = await createVFS(
    new Map([
      ["notes/a.txt", "x"],
      ["notes/b.txt", "y"],
      ["other/c.txt", "z"],
    ]),
  );
  const files = await vfs.list("notes/");
  assertEquals(files, [
    { path: "notes/a.txt", lines: 1 },
    { path: "notes/b.txt", lines: 1 },
  ]);
});

Deno.test("VFS.list -- empty", async () => {
  const vfs = await createVFS();
  assertEquals(await vfs.list(), []);
});

// Grep

Deno.test("VFS.grep -- finds matches across files", async () => {
  const vfs = await createVFS(
    new Map([
      ["a.txt", "hello world\nfoo bar\nhello again"],
      ["b.txt", "no match here\nhello from b"],
    ]),
  );
  const result = await vfs.grep("hello");
  assertEquals(result.matches, [
    {
      path: "a.txt",
      line_number: 1,
      line: "hello world",
      before: [],
      after: ["foo bar", "hello again"],
    },
    {
      path: "a.txt",
      line_number: 3,
      line: "hello again",
      before: ["hello world", "foo bar"],
      after: [],
    },
    {
      path: "b.txt",
      line_number: 2,
      line: "hello from b",
      before: ["no match here"],
      after: [],
    },
  ]);
});

Deno.test("VFS.grep -- case insensitive by default", async () => {
  const vfs = await createVFS(
    new Map([["f.txt", "Hello world\nfoo bar\nhello again"]]),
  );
  const result = await vfs.grep("hello");
  assertEquals(result.matches, [
    {
      path: "f.txt",
      line_number: 1,
      line: "Hello world",
      before: [],
      after: ["foo bar", "hello again"],
    },
    {
      path: "f.txt",
      line_number: 3,
      line: "hello again",
      before: ["Hello world", "foo bar"],
      after: [],
    },
  ]);
});

Deno.test("VFS.grep -- case sensitive", async () => {
  const vfs = await createVFS(
    new Map([["f.txt", "Hello world\nfoo bar\nhello again"]]),
  );
  const result = await vfs.grep("hello", { caseSensitive: true });
  assertEquals(result.matches, [
    {
      path: "f.txt",
      line_number: 3,
      line: "hello again",
      before: ["Hello world", "foo bar"],
      after: [],
    },
  ]);
});

Deno.test("VFS.grep -- with context lines", async () => {
  const vfs = await createVFS(new Map([["f.txt", "a\nb\nMATCH\nd\ne"]]));
  const result = await vfs.grep("MATCH");
  assertEquals(result.matches, [
    {
      path: "f.txt",
      line_number: 3,
      line: "MATCH",
      before: ["a", "b"],
      after: ["d", "e"],
    },
  ]);
});

Deno.test("VFS.grep -- filters to specific path", async () => {
  const vfs = await createVFS(
    new Map([
      ["a.txt", "target"],
      ["b.txt", "target"],
    ]),
  );
  const result = await vfs.grep("target", { path: "a.txt" });
  assertEquals(result.matches, [
    { path: "a.txt", line_number: 1, line: "target", before: [], after: [] },
  ]);
});

Deno.test("VFS.grep -- path as directory prefix", async () => {
  const vfs = await createVFS(
    new Map([
      ["notes/a.txt", "hello world"],
      ["notes/b.txt", "goodbye world"],
      ["other/c.txt", "no match"],
    ]),
  );
  const result = await vfs.grep("world", { path: "notes/" });
  assertEquals(result.matches.length, 2);
  assertEquals(result.matches[0].path, "notes/a.txt");
  assertEquals(result.matches[1].path, "notes/b.txt");
});

Deno.test("VFS.grep -- max results", async () => {
  const vfs = await createVFS(
    new Map([
      ["a.txt", "x\nx\nx\nx"],
      ["b.txt", "x\nx\nx"],
    ]),
  );
  const result = await vfs.grep("x", { maxResults: 3 });
  assertEquals(result.matches.length, 3);
});

Deno.test("VFS.grep -- skips empty files", async () => {
  const vfs = await createVFS(
    new Map([
      ["empty.txt", ""],
      ["f.txt", "hello world"],
    ]),
  );
  const result = await vfs.grep("hello");
  assertEquals(result.matches.length, 1);
  assertEquals(result.matches[0].path, "f.txt");
});

Deno.test("VFS.grep -- invalid regex falls back to literal", async () => {
  const vfs = await createVFS(new Map([["f.txt", "hello [world]"]]));
  const result = await vfs.grep("[world");
  assertEquals(result.matches.length, 1);
});

// Search

Deno.test("VFS.search -- plain text with special chars", async () => {
  const vfs = await createVFS(new Map([["f.txt", "price is $5.00 today"]]));
  const result = await vfs.search("$5.00");
  assertEquals(result.matches.length, 1);
  assertEquals(result.matches[0].line, "price is $5.00 today");
});

Deno.test("VFS.search -- plain text with regex metacharacters", async () => {
  const vfs = await createVFS(
    new Map([["f.txt", "use [bracket] or (paren) or ^caret"]]),
  );
  const result = await vfs.search("[bracket]");
  assertEquals(result.matches.length, 1);
});

Deno.test("VFS.search -- delegates to grep with escaped pattern", async () => {
  const vfs = await createVFS(
    new Map([
      ["a.txt", "hello world"],
      ["b.txt", "goodbye world"],
    ]),
  );
  const result = await vfs.search("world");
  assertEquals(result.matches.length, 2);
});

// Versioning

Deno.test("VFS.getHistory -- includes all versions including latest", async () => {
  const vfs = await createVFS(new Map([["f.txt", "v1"]]));
  await vfs.write("f.txt", "v2");
  await vfs.write("f.txt", "v3");
  const history = await vfs.getHistory("f.txt");
  assertEquals(history.length, 3);
});

Deno.test("VFS.getHistory -- versions are sorted by timestamp", async () => {
  const vfs = await createVFS(new Map([["f.txt", "v1"]]));
  await vfs.write("f.txt", "v2");
  await vfs.write("f.txt", "v3");
  await vfs.write("f.txt", "v4");
  const history = await vfs.getHistory("f.txt");
  assertEquals(history.length, 4);
  for (let i = 1; i < history.length; i++) {
    assertEquals(history[i].timestamp >= history[i - 1].timestamp, true);
  }
});

Deno.test("VFS.getHistory -- includes line count per version", async () => {
  const vfs = await createVFS(new Map([["f.txt", "one line"]]));
  await vfs.write("f.txt", "line one\nline two\nline three");
  const history = await vfs.getHistory("f.txt");
  assertEquals(history[0].lines, 1);
  assertEquals(history[1].lines, 3);
});

Deno.test("VFS.revert -- restores previous version as new version", async () => {
  const vfs = await createVFS(new Map([["f.txt", "original"]]));
  await vfs.write("f.txt", "modified");
  const history = await vfs.getHistory("f.txt");
  const originalVersionId = history[0].version_id;
  const reverted = await vfs.revert("f.txt", originalVersionId);
  assertEquals(reverted, true);
  assertEquals((await vfs.read("f.txt")).content, "original");
});

Deno.test("VFS.revert -- creates a new version when reverting", async () => {
  const vfs = await createVFS(new Map([["f.txt", "v1"]]));
  await vfs.write("f.txt", "v2");
  const history = await vfs.getHistory("f.txt");
  await vfs.revert("f.txt", history[0].version_id);
  const newHistory = await vfs.getHistory("f.txt");
  assertEquals(newHistory.length, 3);
});

Deno.test("VFS.revert -- returns false for invalid version", async () => {
  const vfs = await createVFS(new Map([["f.txt", "content"]]));
  assertEquals(await vfs.revert("f.txt", "nonexistent"), false);
});

// Diff

Deno.test("VFS.diff -- between versions", async () => {
  const vfs = await createVFS(new Map([["f.txt", "line1\nline2\nline3"]]));
  await vfs.write("f.txt", "line1\nmodified\nline3");
  const history = await vfs.getHistory("f.txt");
  const diffResult = await vfs.diff(
    "f.txt",
    history[0].version_id,
    history[1].version_id,
  );
  assertEquals(diffResult.diff.includes("-line2"), true);
  assertEquals(diffResult.diff.includes("+modified"), true);
});

Deno.test("VFS.diff -- identical content produces empty diff", async () => {
  const vfs = await createVFS(new Map([["f.txt", "same"]]));
  await vfs.write("f.txt", "different");
  const history = await vfs.getHistory("f.txt");
  if (history.length >= 2) {
    await vfs.write("f.txt", "same");
    const newHistory = await vfs.getHistory("f.txt");
    const diffResult = await vfs.diff(
      "f.txt",
      newHistory[0].version_id,
      newHistory[2].version_id,
    );
    assertEquals(diffResult.diff, "");
  }
});
