import { assertEquals, assertLessOrEqual } from "@std/assert";
import {
  assembleList,
  CHUNK_PAYLOAD_BYTES,
  frameChunk,
  GET_MANY_MAX,
  MAX_VALUE_BYTES,
  planChunks,
  readChunked,
  unframeChunk,
} from "./chunked.ts";
import { InMemoryAdapter } from "./in_memory_adapter.ts";
import type { Entry, Key } from "./mod.ts";

/** Write a planned set of chunks under a base key; returns the chunk count. */
async function writePlan(
  adapter: InMemoryAdapter,
  base: Key,
  payload: Uint8Array,
): Promise<number> {
  const { keys, values, nChunks } = planChunks(payload);
  for (let i = 0; i < keys.length; i++) {
    await adapter.set([...base, ...keys[i]], values[i]);
  }
  return nChunks;
}

const bytes = (n: number, fill = 65): Uint8Array =>
  new Uint8Array(n).fill(fill);

const text = (value: Uint8Array): string => new TextDecoder().decode(value);

/** Values keyed by their own key, for order-independent assertions. */
const byKey = (entries: Entry[]) =>
  new Map(assembleList(entries).map((v) => [String(v.key), v]));

Deno.test("frameChunk/unframeChunk -- round-trip a payload with its chunk count", () => {
  const payload = new TextEncoder().encode("hello chunk");
  const header = unframeChunk(frameChunk(payload, 7));
  assertEquals(header?.nChunks, 7);
  assertEquals(text(header?.payload ?? new Uint8Array()), "hello chunk");
});

Deno.test("frameChunk -- reserves a byte and counts the head", () => {
  const framed = frameChunk(new Uint8Array(2), 1);
  assertEquals(framed.length, 8);
  assertEquals(framed[0], 0xc1);
  assertEquals(framed[1], 0);
  assertEquals(new DataView(framed.buffer).getUint32(2, true), 1);
});

Deno.test("unframeChunk -- null for values this layer did not write", () => {
  assertEquals(unframeChunk({ some: "object" }), null);
  assertEquals(unframeChunk("a string"), null);
  assertEquals(unframeChunk(42), null);
  assertEquals(unframeChunk(null), null);
  // 0xc1 cannot begin a UTF-8 sequence, so text cannot false-positive.
  assertEquals(unframeChunk(new TextEncoder().encode("hello")), null);
});

Deno.test("unframeChunk -- a zero chunk count is not a header", () => {
  assertEquals(unframeChunk(frameChunk(new Uint8Array(1), 0)), null);
});

Deno.test("planChunks -- a payload at the limit is a single chunk", () => {
  const { keys, nChunks } = planChunks(bytes(CHUNK_PAYLOAD_BYTES));
  assertEquals(nChunks, 1);
  assertEquals(keys, [[]]);
});

Deno.test("planChunks -- one byte over the limit splits in two", () => {
  const { keys, values, nChunks } = planChunks(bytes(CHUNK_PAYLOAD_BYTES + 1));
  assertEquals(nChunks, 2);
  assertEquals(keys, [[], ["c1"]]);
  assertEquals(values[1].length, 7);
  assertEquals(unframeChunk(values[1])?.nChunks, 2);
});

Deno.test("planChunks -- every chunk is a full KV value at most", () => {
  const { values } = planChunks(bytes(CHUNK_PAYLOAD_BYTES * 3 + 17));
  for (const value of values) assertLessOrEqual(value.length, MAX_VALUE_BYTES);
});

Deno.test("planChunks -- an empty payload still yields one chunk", () => {
  const { keys, values, nChunks } = planChunks(new Uint8Array(0));
  assertEquals(nChunks, 1);
  assertEquals(keys.length, 1);
  assertEquals(values[0].length, 6);
});

// Past nine chunks the keys need a second digit, and readChunked has to work
// the same width out from the header or it fetches nothing.
Deno.test("readChunked -- keys widen past nine chunks", async () => {
  const a = new InMemoryAdapter();
  const payload = bytes(CHUNK_PAYLOAD_BYTES * 9 + 1, 0x47);
  const nChunks = await writePlan(a, ["v", "wide-keys"], payload);
  assertEquals(nChunks, 10);
  assertEquals(planChunks(payload).keys[1], ["c01"]);
  const read = await readChunked(a, ["v", "wide-keys"]);
  assertEquals(read?.nReceived, 10);
  assertEquals(text(read?.payload ?? new Uint8Array()), text(payload));
});

Deno.test("readChunked -- a small value round-trips from one write", async () => {
  const a = new InMemoryAdapter();
  const payload = bytes(1_000, 0x61);
  await writePlan(a, ["v", "small"], payload);
  const read = await readChunked(a, ["v", "small"]);
  assertEquals(read?.nChunks, 1);
  assertEquals(read?.nReceived, 1);
  assertEquals(text(read?.payload ?? new Uint8Array()), text(payload));
});

Deno.test("readChunked -- a value past the chunk limit reassembles exactly", async () => {
  const a = new InMemoryAdapter();
  const payload = bytes(CHUNK_PAYLOAD_BYTES * 2 + 5_000, 0x62);
  const nChunks = await writePlan(a, ["v", "big"], payload);
  assertEquals(nChunks, 3);
  const read = await readChunked(a, ["v", "big"]);
  assertEquals(read?.nReceived, 3);
  assertEquals(text(read?.payload ?? new Uint8Array()), text(payload));
});

Deno.test("readChunked -- more chunks than getMany allows, in batches", async () => {
  const a = new InMemoryAdapter();
  // One byte past ten full chunks needs an eleventh, so a second batch.
  const payload = bytes(CHUNK_PAYLOAD_BYTES * GET_MANY_MAX + 1, 0x63);
  const nChunks = await writePlan(a, ["v", "wide"], payload);
  assertEquals(nChunks, GET_MANY_MAX + 1);
  const read = await readChunked(a, ["v", "wide"]);
  assertEquals(read?.nReceived, nChunks);
  assertEquals(text(read?.payload ?? new Uint8Array()), text(payload));
});

Deno.test("readChunked -- undefined for an absent key", async () => {
  const a = new InMemoryAdapter();
  assertEquals(await readChunked(a, ["v", "missing"]), undefined);
});

Deno.test("readChunked -- a value this layer did not write comes back as stored", async () => {
  const a = new InMemoryAdapter();
  await a.set(["v", "plain"], { version_id: "abc" });
  const read = await readChunked(a, ["v", "plain"]);
  assertEquals(read?.nChunks, 1);
  assertEquals(read?.nReceived, 1);
  assertEquals(read?.raw, { version_id: "abc" });
  assertEquals(read?.payload, undefined);
});

Deno.test("readChunked -- a missing chunk is reported, never silently short", async () => {
  const a = new InMemoryAdapter();
  const { keys, values } = planChunks(bytes(CHUNK_PAYLOAD_BYTES * 3, 0x64));
  await a.set(["v", "gap"], values[0]);
  // The middle chunk is missing and the tail is present.
  await a.set(["v", "gap", ...keys[2]], values[2]);
  const read = await readChunked(a, ["v", "gap"]);
  assertEquals(read?.nChunks, 3);
  assertEquals(read?.nReceived, 2);
  assertEquals(read?.payload, undefined);
});

Deno.test("assembleList -- a scan reassembles interleaved heads and chunks", async () => {
  const a = new InMemoryAdapter();
  // Neighbours share the scan, so order cannot come from reading alone.
  await writePlan(a, ["t", "000001"], bytes(4_000, 0x41));
  await writePlan(a, ["t", "000002"], bytes(CHUNK_PAYLOAD_BYTES * 2 + 9, 0x42));
  await writePlan(a, ["t", "000003"], bytes(2_000, 0x43));

  const { entries } = await a.list<Key>(["t"]);
  const values = byKey(entries);
  assertEquals(values.get("t,000001")?.nReceived, 1);
  assertEquals(
    text(values.get("t,000002")?.payload ?? new Uint8Array()),
    text(bytes(CHUNK_PAYLOAD_BYTES * 2 + 9, 0x42)),
  );
  assertEquals(
    text(values.get("t,000003")?.payload ?? new Uint8Array()),
    text(bytes(2_000, 0x43)),
  );
});

Deno.test("assembleList -- a value this layer did not write keeps its own bytes", async () => {
  const a = new InMemoryAdapter();
  await a.set(["t", "000001"], { version_id: "abc" });
  await writePlan(a, ["t", "000002"], bytes(3_000, 0x46));

  const { entries } = await a.list<Key>(["t"]);
  const values = byKey(entries);
  assertEquals(values.get("t,000001")?.raw, { version_id: "abc" });
  assertEquals(values.get("t,000001")?.payload, undefined);
  assertEquals(
    text(values.get("t,000002")?.payload ?? new Uint8Array()),
    text(bytes(3_000, 0x46)),
  );
});

Deno.test("assembleList -- chunks are joined in index order, whatever the input order", () => {
  const chunk = (index: number, byte: number): Entry => ({
    key: index === 0 ? ["t", "000001"] : ["t", "000001", `c${index}`],
    value: frameChunk(new Uint8Array([byte]), 3),
    versionstamp: "",
  });
  const shuffled = [chunk(2, 0x63), chunk(0, 0x61), chunk(1, 0x62)];
  const [value] = assembleList(shuffled);
  assertEquals(value.nChunks, 3);
  assertEquals(value.nReceived, 3);
  assertEquals([...(value.payload ?? new Uint8Array())], [0x61, 0x62, 0x63]);
});

Deno.test("assembleList -- keeps scan order and leaves plain values alone", () => {
  const entries: Entry[] = [
    {
      key: ["t", "000001"],
      value: frameChunk(new Uint8Array(2), 1),
      versionstamp: "",
    },
    { key: ["t", "000002"], value: { plain: true }, versionstamp: "" },
    {
      key: ["t", "000003", "c1"],
      value: frameChunk(new Uint8Array(2), 2),
      versionstamp: "",
    },
  ];
  const values = assembleList(entries);
  // Two values, in scan order: a chunked one and a plain one. The orphan
  // tail is not a value on its own, so it is not reported.
  assertEquals(values.length, 2);
  assertEquals(values[0].key, ["t", "000001"]);
  assertEquals(values[0].nReceived, 1);
  assertEquals(values[1].key, ["t", "000002"]);
  assertEquals(values[1].raw, { plain: true });
});
