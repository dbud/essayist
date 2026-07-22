import { assert, assertEquals } from "@std/assert";
import { InMemoryAdapter } from "../persistence/mod.ts";
import { CHUNK_SIZE } from "./chunked_content.ts";
import { createVFS } from "./testing/helpers.ts";
import { VirtualFileSystem } from "./vfs.ts";

/** Generate ~1.2 MB of text with a known needle ("Ishmael") for grep/diff tests. */
function largeContent(): string {
  const line =
    "Call me Ishmael. Some years ago, having little money in my purse, I sailed about to see the watery world.";
  const lines = Array.from({ length: 12000 }, (_, i) => `${i + 1}: ${line}`);
  return lines.join("\n");
}

Deno.test("VFS -- large document roundtrips", async () => {
  const content = largeContent();
  assert(content.length > CHUNK_SIZE, "fixture should exceed one chunk");

  const vfs = await createVFS(new Map([["big.md", content]]));
  const result = await vfs.read("big.md");
  assertEquals(result.content, content);
  assertEquals(result.lines, content.split("\n").length);
});

Deno.test("VFS -- large document line range read", async () => {
  const content = largeContent();
  const vfs = await createVFS(new Map([["big.md", content]]));
  const result = await vfs.read("big.md", { startLine: 100, endLine: 200 });
  const expected = content.split("\n").slice(99, 200).join("\n");
  assertEquals(result.content, expected);
  assertEquals(result.start_line, 100);
  assertEquals(result.end_line, 200);
});

Deno.test("VFS -- large document grep", async () => {
  const content = largeContent();
  const vfs = await createVFS(new Map([["big.md", content]]));
  const result = await vfs.grep("Ishmael", { path: "big.md", maxResults: 5 });
  assert(result.matches.length > 0);
  for (const m of result.matches) {
    assertEquals(m.path, "big.md");
    assert(/Ishmael/i.test(m.line));
  }
});

Deno.test("VFS -- large document mark on a span in a later chunk", async () => {
  const content = largeContent();
  const vfs = await createVFS(new Map([["big.md", content]]));
  // Span at the midpoint -- past the first chunk boundary.
  const offset = Math.floor(content.length / 2);
  const span = content.slice(offset, offset + 40);
  assert(span.length === 40, "span must be inside the content");

  const mark = await vfs.mark("big.md", span, "mid-file comment");
  assertEquals(mark.marked, true);

  const file = await vfs.read("big.md");
  const marks = await vfs.getMarks("big.md", file.version_id);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].selected_text, span);
  assertEquals(marks[0].offset, offset);
});

Deno.test("VFS -- large document versioning and revert", async () => {
  const content = largeContent();
  const vfs = await createVFS(new Map([["big.md", content]]));
  const first = await vfs.read("big.md");
  const firstVersion = first.version_id;

  // Truncate to first 1000 chars + a marker.
  const modified = `${content.slice(0, 1000)}\n[edited]\n`;
  await vfs.write("big.md", modified);

  const history = await vfs.getHistory("big.md");
  assertEquals(history.length, 2);

  const reverted = await vfs.revert("big.md", firstVersion);
  assertEquals(reverted, true);

  const after = await vfs.read("big.md");
  assertEquals(after.content, content);
});

Deno.test("VFS -- large document diff between versions", async () => {
  const content = largeContent();
  const vfs = await createVFS(new Map([["big.md", content]]));
  const v1 = (await vfs.read("big.md")).version_id;

  const modified = content.replace("Ishmael", "ISHMAEL");
  await vfs.write("big.md", modified);
  const v2 = (await vfs.getHistory("big.md"))[1].version_id;

  const { diff } = await vfs.diff("big.md", v1, v2);
  assert(diff.includes("Ishmael"), "diff should contain the removed line");
  assert(diff.includes("ISHMAEL"), "diff should contain the added line");
});

Deno.test("VFS -- large write inlines first chunk, rest as chunk keys", async () => {
  const content = largeContent();
  const adapter = new InMemoryAdapter();
  const vfs = new VirtualFileSystem(adapter, "ws");
  await vfs.write("big.md", content);

  const { entries } = await adapter.list(["ws", "ws", "file:content"]);
  const manifestKeys = entries.filter(
    (e) => e.key[e.key.length - 1] === "file:manifest",
  );
  const chunkKeys = entries.filter(
    (e) => e.key[e.key.length - 2] === "file:chunk",
  );
  assertEquals(manifestKeys.length, 1);
  // Chunk 0 is inlined in the manifest; chunk keys start at index 1.
  const indices = chunkKeys
    .map((e) => Number(e.key[e.key.length - 1]))
    .sort((a, b) => a - b);
  assertEquals(indices[0], 1);
  assert(chunkKeys.length > 1, "should produce multiple chunk keys");
  for (const e of chunkKeys) {
    const v = e.value as Uint8Array;
    assert(v.length <= CHUNK_SIZE, "chunk must respect CHUNK_SIZE");
  }
});
