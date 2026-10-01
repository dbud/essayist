import { assertEquals, assertExists, assertRejects } from "@std/assert";
import {
  GET_MANY_MAX,
  planChunks,
  splitChunkKey,
  unframeChunk,
} from "./chunked.ts";
import { InMemoryAdapter } from "./in_memory_adapter.ts";
import { ChunkedValueStore } from "./value_store.ts";

interface Note {
  id: string;
  body: string;
}

const note = (body: string): Note => ({ id: "n1", body });

/** How many entries a body of this length is stored as. */
const chunksFor = (body: string): number =>
  planChunks(new TextEncoder().encode(JSON.stringify(note(body)))).length;

Deno.test("ChunkedValueStore -- a value that fits round-trips", async () => {
  const store = new ChunkedValueStore<Note>(new InMemoryAdapter());
  await store.put(["n", "one"], note("hello"));
  const found = await store.list(["n"]);
  assertEquals(found.length, 1);
  assertEquals(found[0].key, ["n", "one"]);
  assertEquals(found[0].value, note("hello"));
});

Deno.test("ChunkedValueStore -- a value too big for one entry round-trips", async () => {
  const adapter = new InMemoryAdapter();
  const store = new ChunkedValueStore<Note>(adapter);
  const body = "x".repeat(200_000);
  await store.put(["n", "big"], note(body));
  const { entries } = await adapter.list<Uint8Array>(["n"]);
  assertEquals(entries.length, chunksFor(body));
  assertEquals(entries.length > 1, true);
  for (const entry of entries) {
    assertEquals(unframeChunk(entry.value) !== null, true);
  }
  const [found] = await store.list(["n"]);
  assertEquals(found.value, note(body));
});

Deno.test("ChunkedValueStore -- a value needing several getMany batches round-trips", async () => {
  const adapter = new InMemoryAdapter();
  const store = new ChunkedValueStore<Note>(adapter);
  const body = "y".repeat(2_000_000);
  await store.put(["n", "wide"], note(body));
  // Past getMany's ten-key limit, so a read spans several batches.
  assertEquals(chunksFor(body) > GET_MANY_MAX, true);
  const [found] = await store.list(["n"]);
  assertEquals(found.value, note(body));
});

Deno.test("ChunkedValueStore -- list returns values in key order", async () => {
  const store = new ChunkedValueStore<Note>(new InMemoryAdapter());
  await store.put(["n", "000003"], note("third"));
  await store.put(["n", "000001"], note("first"));
  await store.put(["n", "000002"], note("second"));
  const found = await store.list(["n"]);
  assertEquals(
    found.map((v) => v.key[1]),
    ["000001", "000002", "000003"],
  );
});

Deno.test("ChunkedValueStore -- a scan does not reach into another prefix", async () => {
  const store = new ChunkedValueStore<Note>(new InMemoryAdapter());
  await store.put(["n", "one"], note("a"));
  await store.put(["other", "one"], note("b"));
  const found = await store.list(["n"]);
  assertEquals(found.length, 1);
  assertEquals(found[0].value, note("a"));
});

Deno.test("ChunkedValueStore -- an empty prefix returns nothing", async () => {
  const store = new ChunkedValueStore<Note>(new InMemoryAdapter());
  assertEquals(await store.list(["nothing"]), []);
});

Deno.test("ChunkedValueStore -- writing over a value leaves no stale chunks", async () => {
  const adapter = new InMemoryAdapter();
  const store = new ChunkedValueStore<Note>(adapter);
  await store.put(["n", "k"], note("z".repeat(200_000)));
  await store.put(["n", "k"], note("short"));
  // The longer value's tail entries have to be gone, not just unread.
  const { entries } = await adapter.list<Uint8Array>(["n"]);
  assertEquals(entries.length, 1);
  const [found] = await store.list(["n"]);
  assertEquals(found.value, note("short"));
});

Deno.test("ChunkedValueStore -- a value with a chunk missing is reported", async () => {
  const adapter = new InMemoryAdapter();
  const store = new ChunkedValueStore<Note>(adapter);
  await store.put(["n", "gap"], note("x".repeat(200_000)));
  // Drop a tail chunk, leaving the head claiming chunks that are not there.
  const { entries } = await adapter.list<Uint8Array>(["n"]);
  const tail = entries.find((entry) => splitChunkKey(entry.key).index > 0);
  assertExists(tail);
  await adapter.delete([...tail.key]);
  const err = await assertRejects(
    () => store.list(["n"]),
    Error,
    "missing chunks",
  );
  // The message counts the chunks that turned up against the ones expected.
  assertEquals(/missing chunks: \d+ of \d+/.test(err.message), true);
});
