import { type Kv, openKv } from "@deno/kv";
import { assertEquals, assertLessOrEqual } from "@std/assert";
import { type Context, Effect } from "effect";
import { test } from "vitest";

import {
  assembleList,
  CHUNK_PAYLOAD_BYTES,
  frameChunk,
  MAX_VALUE_BYTES,
  planChunks,
  unframeChunk,
} from "./chunked.ts";
import { kvLayer } from "./kv_layer.ts";
import type { Entry, Key } from "./mod.ts";
import { Persistence } from "./mod.ts";

const bytes = (n: number, fill = 65): Uint8Array => new Uint8Array(n).fill(fill);

const text = (value: Uint8Array): string => new TextDecoder().decode(value);

/** Values keyed by their own key, for order-independent assertions. */
const byKey = (entries: Entry[]) => new Map(assembleList(entries).map((v) => [String(v.key), v]));

/** Write a planned set of chunks under a base key. */
const writePlan = (
  persistence: Context.Service.Shape<typeof Persistence>,
  base: Key,
  payload: Uint8Array,
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    for (const chunk of planChunks(payload)) {
      yield* persistence.set([...base, ...chunk.key], chunk.value);
    }
  });

/** Run a body against a Persistence instance on a fresh store. */
const store = <A>(
  kv: Kv,
  body: (persistence: Context.Service.Shape<typeof Persistence>) => Effect.Effect<A, unknown>,
): Promise<A> =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const persistence = yield* Persistence;
        return yield* body(persistence);
      }),
      kvLayer(kv),
    ),
  );

test("frameChunk/unframeChunk -- round-trip a payload with its chunk count", () => {
  const payload = new TextEncoder().encode("hello chunk");
  const header = unframeChunk(frameChunk(payload, 7));
  assertEquals(header?.nChunks, 7);
  assertEquals(text(header?.payload ?? new Uint8Array()), "hello chunk");
});

test("frameChunk -- reserves a byte and counts the head", () => {
  const framed = frameChunk(new Uint8Array(2), 1);
  assertEquals(framed.length, 8);
  assertEquals(framed[0], 0xc1);
  assertEquals(framed[1], 0);
  assertEquals(new DataView(framed.buffer).getUint32(2, true), 1);
});

test("unframeChunk -- null for values this layer did not write", () => {
  assertEquals(unframeChunk({ some: "object" }), null);
  assertEquals(unframeChunk("a string"), null);
  assertEquals(unframeChunk(42), null);
  assertEquals(unframeChunk(null), null);
  // 0xc1 cannot begin a UTF-8 sequence, so text cannot false-positive.
  assertEquals(unframeChunk(new TextEncoder().encode("hello")), null);
});

test("unframeChunk -- a zero chunk count is not a header", () => {
  assertEquals(unframeChunk(frameChunk(new Uint8Array(1), 0)), null);
});

test("planChunks -- a payload at the limit is a single chunk", () => {
  const chunks = planChunks(bytes(CHUNK_PAYLOAD_BYTES));
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0].key, []);
});

test("planChunks -- one byte over the limit splits in two", () => {
  const chunks = planChunks(bytes(CHUNK_PAYLOAD_BYTES + 1));
  assertEquals(chunks.length, 2);
  assertEquals(
    chunks.map((c) => c.key),
    [[], ["c1"]],
  );
  assertEquals(chunks[1].value.length, 7);
  assertEquals(unframeChunk(chunks[1].value)?.nChunks, 2);
});

test("planChunks -- every chunk is a full KV value at most", () => {
  for (const chunk of planChunks(bytes(CHUNK_PAYLOAD_BYTES * 3 + 17))) {
    assertLessOrEqual(chunk.value.length, MAX_VALUE_BYTES);
  }
});

test("planChunks -- an empty payload still yields one chunk", () => {
  const chunks = planChunks(new Uint8Array(0));
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0].value.length, 6);
});

test("assembleList -- a scan reassembles interleaved heads and chunks", async () => {
  const kv = await openKv();
  // Neighbours share the scan, so order cannot come from reading alone.
  const values = await store(kv, (persistence) =>
    Effect.gen(function* () {
      yield* writePlan(persistence, ["t", "000001"], bytes(4_000, 0x41));
      yield* writePlan(persistence, ["t", "000002"], bytes(CHUNK_PAYLOAD_BYTES * 2 + 9, 0x42));
      yield* writePlan(persistence, ["t", "000003"], bytes(2_000, 0x43));
      const { entries } = yield* persistence.list<Key>(["t"]);
      return byKey(entries);
    }),
  );

  assertEquals(values.get("t,000001")?.nReceived, 1);
  assertEquals(
    text(values.get("t,000002")?.payload ?? new Uint8Array()),
    text(bytes(CHUNK_PAYLOAD_BYTES * 2 + 9, 0x42)),
  );
  assertEquals(text(values.get("t,000003")?.payload ?? new Uint8Array()), text(bytes(2_000, 0x43)));
});

test("assembleList -- a value this layer did not write keeps its own bytes", async () => {
  const kv = await openKv();
  const values = await store(kv, (persistence) =>
    Effect.gen(function* () {
      yield* persistence.set(["t", "000001"], { version_id: "abc" });
      yield* writePlan(persistence, ["t", "000002"], bytes(3_000, 0x46));
      const { entries } = yield* persistence.list<Key>(["t"]);
      return byKey(entries);
    }),
  );

  assertEquals(values.get("t,000001")?.raw, { version_id: "abc" });
  assertEquals(values.get("t,000001")?.payload, undefined);
  assertEquals(text(values.get("t,000002")?.payload ?? new Uint8Array()), text(bytes(3_000, 0x46)));
});

test("assembleList -- chunks are joined in index order, whatever the input order", () => {
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

test("assembleList -- keeps scan order and leaves plain values alone", () => {
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
  // Two values, in scan order: a chunked one and a plain one. The orphan tail is not a value on its
  // own, so it is not reported.
  assertEquals(values.length, 2);
  assertEquals(values[0].key, ["t", "000001"]);
  assertEquals(values[0].nReceived, 1);
  assertEquals(values[1].key, ["t", "000002"]);
  assertEquals(values[1].raw, { plain: true });
});
