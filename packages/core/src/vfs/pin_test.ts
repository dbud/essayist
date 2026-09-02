import { assertEquals } from "@std/assert";
import { PinnedVFS } from "./pin.ts";
import { createFile, createVFS } from "./testing/helpers.ts";

Deno.test("PinnedVFS.read -- pinned path reads the pinned version", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "old text");
  await vfs.write("f.txt", "new text");
  const pinned = new PinnedVFS(vfs, { path: "f.txt", versionId: v1 });

  const result = await pinned.read("f.txt");

  assertEquals(result.version_id, v1);
  assertEquals(result.content, "old text");
});

Deno.test("PinnedVFS.read -- other paths read latest", async () => {
  const vfs = await createVFS(
    new Map([
      ["pinned.txt", "pinned"],
      ["other.txt", "old"],
    ]),
  );
  const pinnedV1 = (await vfs.read("pinned.txt")).version_id;
  await vfs.write("other.txt", "new");
  const expected = await vfs.read("other.txt");
  const pinned = new PinnedVFS(vfs, {
    path: "pinned.txt",
    versionId: pinnedV1,
  });

  const result = await pinned.read("other.txt");

  assertEquals(result.version_id, expected.version_id);
  assertEquals(result.content, "new");
});

Deno.test("PinnedVFS.mark -- pinned path marks the pinned version", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "hello world");
  await vfs.write("f.txt", "goodbye world");
  const pinned = new PinnedVFS(vfs, { path: "f.txt", versionId: v1 });

  const result = await pinned.mark("f.txt", "hello", "greeting");

  assertEquals(result.marked, true);
  const marks = await vfs.getMarks("f.txt", v1);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].comment, "greeting");
  const latest = await vfs.read("f.txt");
  assertEquals(await vfs.getMarks("f.txt", latest.version_id), []);
});

Deno.test("PinnedVFS.mark -- other paths mark latest", async () => {
  const vfs = await createVFS(
    new Map([
      ["pinned.txt", "pinned"],
      ["other.txt", "other text"],
    ]),
  );
  const pinnedV1 = (await vfs.read("pinned.txt")).version_id;
  const pinned = new PinnedVFS(vfs, {
    path: "pinned.txt",
    versionId: pinnedV1,
  });

  const result = await pinned.mark("other.txt", "other text", "note");

  assertEquals(result.marked, true);
  const otherLatest = (await vfs.read("other.txt")).version_id;
  const marks = await vfs.getMarks("other.txt", otherLatest);
  assertEquals(marks.length, 1);
});

Deno.test("PinnedVFS.write -- delegates to the inner VFS", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "v1");
  const pinned = new PinnedVFS(vfs, { path: "f.txt", versionId: v1 });

  await pinned.write("f.txt", "v2");

  const latest = await vfs.read("f.txt");
  assertEquals(latest.content, "v2");
  assertEquals(latest.version_id !== v1, true);
});

Deno.test("PinnedVFS.grep -- delegates to the inner VFS", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "needle here");
  const pinned = new PinnedVFS(vfs, { path: "f.txt", versionId: v1 });

  const result = await pinned.grep("needle");

  assertEquals(result.matches.length, 1);
  assertEquals(result.matches[0].path, "f.txt");
});

Deno.test("PinnedVFS.getMarks -- delegates to the inner VFS", async () => {
  const { vfs, versionId: v1 } = await createFile("f.txt", "hello");
  await vfs.mark("f.txt", "hello", "note");
  const pinned = new PinnedVFS(vfs, { path: "f.txt", versionId: v1 });

  const marks = await pinned.getMarks("f.txt", v1);

  assertEquals(marks.length, 1);
});
