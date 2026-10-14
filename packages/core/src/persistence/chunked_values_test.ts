import { openKv } from "@deno/kv";
import { assert, assertEquals, assertExists } from "@std/assert";
import { type Context, Effect, Layer, Result } from "effect";
import { test } from "vitest";
import { unframeChunk } from "./chunked.ts";
import { ChunkedValues, MissingChunksError } from "./chunked_values.ts";
import { kvLayerCompat } from "./kv_layer_compat.ts";
import { Persistence } from "./mod.ts";

interface Note {
  id: string;
  body: string;
}

const note = (body: string): Note => ({ id: "n1", body });

/** Wrap a chunked-values program plus raw persistence access in one store. */
const readWithStore = async <A>(
  body: (deps: {
    values: Context.Service.Shape<typeof ChunkedValues>;
    persistence: Context.Service.Shape<typeof Persistence>;
  }) => Effect.Effect<A, unknown, ChunkedValues | Persistence>,
): Promise<A> => {
  const kv = await openKv();
  try {
    const env = Layer.merge(
      kvLayerCompat(kv),
      Layer.provide(ChunkedValues.layerNoDeps, kvLayerCompat(kv)),
    );
    return await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const values = yield* ChunkedValues;
          const persistence = yield* Persistence;
          return yield* body({ values, persistence });
        }),
        env,
      ),
    );
  } finally {
    await kv.close();
  }
};

test("ChunkedValues -- a value that fits round-trips", async () => {
  const found = await readWithStore(({ values }) =>
    Effect.gen(function* () {
      yield* values.put(["n", "one"], note("hello"));
      return yield* values.list<Note>(["n"]);
    }),
  );
  assertEquals(found.length, 1);
  assertEquals(found[0].key, ["n", "one"]);
  assertEquals(found[0].value, note("hello"));
});

test("ChunkedValues -- a value too big for one entry round-trips", async () => {
  const body = "x".repeat(200_000);
  const state = await readWithStore(({ values, persistence }) =>
    Effect.gen(function* () {
      yield* values.put(["n", "big"], note(body));
      const { entries } = yield* persistence.list<Uint8Array>(["n"]);
      const [found] = yield* values.list<Note>(["n"]);
      return { entries, found };
    }),
  );
  assertEquals(state.entries.length > 1, true);
  for (const entry of state.entries) {
    assertEquals(unframeChunk(entry.value) !== null, true);
  }
  assertEquals(state.found.value, note(body));
});

test("ChunkedValues -- a value needing many entries round-trips", async () => {
  const body = "y".repeat(2_000_000);
  const found = await readWithStore(({ values }) =>
    Effect.gen(function* () {
      yield* values.put(["n", "wide"], note(body));
      return yield* values.list<Note>(["n"]);
    }),
  );
  assertEquals(found[0].value, note(body));
});

test("ChunkedValues -- list returns values in key order", async () => {
  const keys = await readWithStore(({ values }) =>
    Effect.gen(function* () {
      yield* values.put(["n", "000003"], note("third"));
      yield* values.put(["n", "000001"], note("first"));
      yield* values.put(["n", "000002"], note("second"));
      const found = yield* values.list<Note>(["n"]);
      return found.map((v) => v.key[1]);
    }),
  );
  assertEquals(keys, ["000001", "000002", "000003"]);
});

test("ChunkedValues -- a scan does not reach into another prefix", async () => {
  const found = await readWithStore(({ values }) =>
    Effect.gen(function* () {
      yield* values.put(["n", "one"], note("a"));
      yield* values.put(["other", "one"], note("b"));
      return yield* values.list<Note>(["n"]);
    }),
  );
  assertEquals(found.length, 1);
  assertEquals(found[0].value, note("a"));
});

test("ChunkedValues -- an empty prefix returns nothing", async () => {
  const found = await readWithStore(({ values }) =>
    Effect.gen(function* () {
      return yield* values.list(["nothing"]);
    }),
  );
  assertEquals(found, []);
});

test("ChunkedValues -- writing over a value leaves no stale chunks", async () => {
  const state = await readWithStore(({ values, persistence }) =>
    Effect.gen(function* () {
      yield* values.put(["n", "k"], note("z".repeat(200_000)));
      yield* values.put(["n", "k"], note("short"));
      // The longer value's tail entries have to be gone, not just unread.
      const { entries } = yield* persistence.list<Uint8Array>(["n"]);
      const [found] = yield* values.list<Note>(["n"]);
      return { entries, found };
    }),
  );
  assertEquals(state.entries.length, 1);
  assertEquals(state.found.value, note("short"));
});

test("ChunkedValues -- a value with a chunk missing is reported", async () => {
  const outcome = await readWithStore(({ values, persistence }) =>
    Effect.gen(function* () {
      yield* values.put(["n", "gap"], note("x".repeat(200_000)));
      // Drop a tail chunk, leaving the head claiming chunks that are not
      // there.
      const { entries } = yield* persistence.list<Uint8Array>(["n"]);
      const tail = entries.at(-1);
      assertExists(tail);
      yield* persistence.delete([...tail.key]);
      return yield* Effect.result(values.list<Note>(["n"]));
    }),
  );
  assert(Result.isFailure(outcome), "the missing-chunk value must fail");
  if (Result.isFailure(outcome)) {
    assert(outcome.failure instanceof MissingChunksError, "the error type");
  }
});
