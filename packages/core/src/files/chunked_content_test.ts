import { assertEquals, assertNotEquals } from "@std/assert";
import { test } from "vitest";

import {
  CHUNK_SIZE,
  chunkContent,
  joinChunks,
  reassemble,
  splitContent,
} from "./chunked_content.ts";

test("splitContent/joinChunks -- roundtrip ASCII", () => {
  const content = "The quick brown fox jumps over the lazy dog.";
  const chunks = splitContent(content, 10);
  assertNotEquals(chunks.length, 1); // multiple chunks for >10 bytes
  assertEquals(joinChunks(chunks), content);
});

test("splitContent/joinChunks -- empty content", () => {
  const chunks = splitContent("");
  assertEquals(chunks, []);
  assertEquals(joinChunks([]), "");
});

test("splitContent/joinChunks -- small content is one chunk", () => {
  const content = "hello";
  const chunks = splitContent(content);
  assertEquals(chunks.length, 1);
  assertEquals(joinChunks(chunks), content);
});

test("splitContent -- respects maxBytes", () => {
  const content = "a".repeat(1000);
  const chunks = splitContent(content, 100);
  for (const c of chunks) {
    assertEquals(c.length <= 100, true);
  }
  assertEquals(joinChunks(chunks), content);
});

test("splitContent -- never splits a multi-byte UTF-8 sequence", () => {
  // CJK chars are 3 UTF-8 bytes; maxBytes=10 (not a multiple of 3) forces boundary backup.
  const content = "你好世界".repeat(50);
  const chunks = splitContent(content, 10);
  for (const c of chunks) {
    // Each chunk must decode to a substring of the original (no partial chars).
    assertEquals(content.includes(new TextDecoder().decode(c)), true);
  }
  assertEquals(joinChunks(chunks), content);
});

test("splitContent -- never splits a 4-byte emoji sequence", () => {
  // U+1F600 is 4 UTF-8 bytes; maxBytes=6 forces a split inside the emoji.
  const content = "😀😀😀😀😀😀😀😀😀😀";
  const chunks = splitContent(content, 6);
  for (const c of chunks) {
    for (const ch of new TextDecoder().decode(c)) {
      assertEquals(content.includes(ch), true);
    }
  }
  assertEquals(joinChunks(chunks), content);
});

test("splitContent -- exact CHUNK_SIZE boundary", () => {
  const content = "a".repeat(CHUNK_SIZE);
  const chunks = splitContent(content);
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0].length, CHUNK_SIZE);
  assertEquals(joinChunks(chunks), content);
});

test("splitContent -- CHUNK_SIZE + 1 splits into two", () => {
  const content = "a".repeat(CHUNK_SIZE + 1);
  const chunks = splitContent(content);
  assertEquals(chunks.length, 2);
  assertEquals(chunks[0].length, CHUNK_SIZE);
  assertEquals(chunks[1].length, 1);
  assertEquals(joinChunks(chunks), content);
});

test("chunkContent -- single chunk inlined, no extras", () => {
  const content = "hello\nworld\n";
  const { manifest, extraChunks } = chunkContent(content);
  assertEquals(manifest.chunkCount, 1);
  assertEquals(new TextDecoder().decode(manifest.firstChunk), content);
  assertEquals(extraChunks, []);
});

test("chunkContent -- multiple chunks inline first, rest as extras", () => {
  const content = "a".repeat(CHUNK_SIZE + 1);
  const { manifest, extraChunks } = chunkContent(content);
  assertEquals(manifest.chunkCount, 2);
  assertEquals(manifest.firstChunk.length, CHUNK_SIZE);
  assertEquals(extraChunks.length, 1);
  assertEquals(extraChunks[0].length, 1);
});

test("chunkContent -- empty content yields one empty inline chunk", () => {
  const { manifest, extraChunks } = chunkContent("");
  assertEquals(manifest.chunkCount, 1);
  assertEquals(manifest.firstChunk, new Uint8Array(0));
  assertEquals(extraChunks, []);
});

test("chunkContent/reassemble -- single chunk roundtrip", () => {
  const content = "hello\nworld\n";
  const { manifest, extraChunks } = chunkContent(content);
  assertEquals(reassemble(manifest, extraChunks), content);
});

test("chunkContent/reassemble -- multi-chunk roundtrip", () => {
  const content = "a".repeat(CHUNK_SIZE * 3 + 17);
  const { manifest, extraChunks } = chunkContent(content);
  assertEquals(reassemble(manifest, extraChunks), content);
});
