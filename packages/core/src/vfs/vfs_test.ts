import { assertEquals } from "@std/assert";
import { InMemoryAdapter } from "./persistence.ts";
import { VirtualFileSystem } from "./vfs.ts";

function createVFS(files?: Map<string, string>): VirtualFileSystem {
  const adapter = new InMemoryAdapter();
  if (files) {
    for (const [path, content] of files) {
      adapter.set(`file:${path}`, content);
    }
  }
  return new VirtualFileSystem(adapter);
}

const sampleEssay = [
  "The quick brown fox jumps over the lazy dog.",
  "This sentence contains every letter of the alphabet.",
  "It has been used as a typing test since the late 1800s.",
  "The fox was quick, the dog was lazy, and the sentence was perfect.",
].join("\n");

// Read

Deno.test("VFS.read -- full file", () => {
  const vfs = createVFS(new Map([["essay.txt", sampleEssay]]));
  const result = vfs.read("essay.txt");
  assertEquals(result.content, sampleEssay);
  assertEquals(result.total_lines, 4);
  assertEquals(result.start_line, 1);
  assertEquals(result.end_line, 4);
});

Deno.test("VFS.read -- line range", () => {
  const vfs = createVFS(new Map([["essay.txt", sampleEssay]]));
  const result = vfs.read("essay.txt", 2, 3);
  assertEquals(result.content, sampleEssay.split("\n").slice(1, 3).join("\n"));
  assertEquals(result.total_lines, 4);
  assertEquals(result.start_line, 2);
  assertEquals(result.end_line, 3);
});

Deno.test("VFS.read -- numbered output", () => {
  const vfs = createVFS(new Map([["essay.txt", sampleEssay]]));
  const result = vfs.read("essay.txt", 1, 2, true);
  const lines = result.content.split("\n");
  assertEquals(
    lines[0],
    "     1: The quick brown fox jumps over the lazy dog.",
  );
  assertEquals(
    lines[1],
    "     2: This sentence contains every letter of the alphabet.",
  );
});

Deno.test("VFS.read -- missing file returns empty", () => {
  const vfs = createVFS();
  const result = vfs.read("missing.txt");
  assertEquals(result.content, "");
  assertEquals(result.total_lines, 0);
});

Deno.test("VFS.read -- clamps line range", () => {
  const vfs = createVFS(new Map([["essay.txt", sampleEssay]]));
  const result = vfs.read("essay.txt", -5, 100);
  assertEquals(result.start_line, 1);
  assertEquals(result.end_line, 4);
});

// Write

Deno.test("VFS.write -- creates new file", () => {
  const vfs = createVFS();
  const result = vfs.write("new.txt", "hello\nworld");
  assertEquals(result.created, true);
  assertEquals(result.lines, 2);
  assertEquals(result.path, "new.txt");
});

Deno.test("VFS.write -- overwrites existing file", () => {
  const vfs = createVFS(new Map([["f.txt", "old"]]));
  const result = vfs.write("f.txt", "new content");
  assertEquals(result.created, false);
  assertEquals(result.lines, 1);
});

Deno.test("VFS.write -- auto-versioning on overwrite", () => {
  const vfs = createVFS(new Map([["f.txt", "version1"]]));
  vfs.write("f.txt", "version2");
  const history = vfs.getHistory("f.txt");
  assertEquals(history.length, 1);
});

// List

Deno.test("VFS.list -- all files", () => {
  const vfs = createVFS(
    new Map([
      ["a.txt", "line1"],
      ["b.txt", "line1\nline2"],
      ["c.md", "x\ny\nz"],
    ]),
  );
  const files = vfs.list();
  assertEquals(files.length, 3);
  assertEquals(files[0].path, "a.txt");
  assertEquals(files[0].lines, 1);
  assertEquals(files[1].path, "b.txt");
  assertEquals(files[1].lines, 2);
  assertEquals(files[2].path, "c.md");
  assertEquals(files[2].lines, 3);
});

Deno.test("VFS.list -- with prefix", () => {
  const vfs = createVFS(
    new Map([
      ["notes/a.txt", "x"],
      ["notes/b.txt", "y"],
      ["other/c.txt", "z"],
    ]),
  );
  const files = vfs.list("notes/");
  assertEquals(files.length, 2);
  assertEquals(files[0].path, "notes/a.txt");
  assertEquals(files[1].path, "notes/b.txt");
});

Deno.test("VFS.list -- empty", () => {
  const vfs = createVFS();
  assertEquals(vfs.list(), []);
});

// Grep

Deno.test("VFS.grep -- finds matches across files", () => {
  const vfs = createVFS(
    new Map([
      ["a.txt", "hello world\nfoo bar\nhello again"],
      ["b.txt", "no match here\nhello from b"],
    ]),
  );
  const result = vfs.grep("hello");
  assertEquals(result.matches.length, 3);
  assertEquals(result.matches[0].path, "a.txt");
  assertEquals(result.matches[0].line_number, 1);
  assertEquals(result.matches[0].line, "hello world");
  assertEquals(result.matches[1].path, "a.txt");
  assertEquals(result.matches[1].line_number, 3);
  assertEquals(result.matches[1].line, "hello again");
  assertEquals(result.matches[2].path, "b.txt");
  assertEquals(result.matches[2].line_number, 2);
  assertEquals(result.matches[2].line, "hello from b");
});

Deno.test("VFS.grep -- case insensitive by default", () => {
  const vfs = createVFS(
    new Map([["f.txt", "Hello world\nfoo bar\nhello again"]]),
  );
  const result = vfs.grep("hello");
  assertEquals(result.matches.length, 2);
  assertEquals(result.matches[0].line_number, 1);
  assertEquals(result.matches[0].line, "Hello world");
  assertEquals(result.matches[1].line_number, 3);
  assertEquals(result.matches[1].line, "hello again");
});

Deno.test("VFS.grep -- case sensitive", () => {
  const vfs = createVFS(
    new Map([["f.txt", "Hello world\nfoo bar\nhello again"]]),
  );
  const result = vfs.grep("hello", { caseSensitive: true });
  assertEquals(result.matches.length, 1);
  assertEquals(result.matches[0].line_number, 3);
  assertEquals(result.matches[0].line, "hello again");
});

Deno.test("VFS.grep -- with context lines", () => {
  const vfs = createVFS(new Map([["f.txt", "a\nb\nMATCH\nd\ne"]]));
  const result = vfs.grep("MATCH");
  assertEquals(result.matches[0].before, ["a", "b"]);
  assertEquals(result.matches[0].after, ["d", "e"]);
});

Deno.test("VFS.grep -- filters to specific path", () => {
  const vfs = createVFS(
    new Map([
      ["a.txt", "target"],
      ["b.txt", "target"],
    ]),
  );
  const result = vfs.grep("target", { path: "a.txt" });
  assertEquals(result.matches.length, 1);
  assertEquals(result.matches[0].path, "a.txt");
});

Deno.test("VFS.grep -- max results", () => {
  const vfs = createVFS(new Map([["f.txt", "x\nx\nx\nx\nx"]]));
  const result = vfs.grep("x", { maxResults: 3 });
  assertEquals(result.matches.length, 3);
});

Deno.test("VFS.grep -- invalid regex falls back to literal", () => {
  const vfs = createVFS(new Map([["f.txt", "hello [world]"]]));
  const result = vfs.grep("[world]");
  assertEquals(result.matches.length, 1);
});

// Versioning

Deno.test("VFS.getHistory -- empty for new file", () => {
  const vfs = createVFS(new Map([["f.txt", "content"]]));
  assertEquals(vfs.getHistory("f.txt"), []);
});

Deno.test("VFS.getHistory -- tracks multiple versions", () => {
  const vfs = createVFS(new Map([["f.txt", "v1"]]));
  vfs.write("f.txt", "v2");
  vfs.write("f.txt", "v3");
  const history = vfs.getHistory("f.txt");
  assertEquals(history.length, 2);
  assertEquals(history[0].timestamp <= history[1].timestamp, true);
});

Deno.test("VFS.revert -- restores previous version", () => {
  const vfs = createVFS(new Map([["f.txt", "original"]]));
  vfs.write("f.txt", "modified");
  const history = vfs.getHistory("f.txt");
  const reverted = vfs.revert("f.txt", history[0].version_id);
  assertEquals(reverted, true);
  assertEquals(vfs.read("f.txt").content, "original");
});

Deno.test("VFS.revert -- snapshots current before reverting", () => {
  const vfs = createVFS(new Map([["f.txt", "v1"]]));
  vfs.write("f.txt", "v2");
  const history = vfs.getHistory("f.txt");
  vfs.revert("f.txt", history[0].version_id);
  const newHistory = vfs.getHistory("f.txt");
  assertEquals(newHistory.length, 2);
});

Deno.test("VFS.revert -- returns false for invalid version", () => {
  const vfs = createVFS(new Map([["f.txt", "content"]]));
  assertEquals(vfs.revert("f.txt", "nonexistent"), false);
});
