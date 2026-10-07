/**
 * One scenario battery for the two native Persistence layers, kv and
 * memory. Cursors are held opaquely (taken from a previous page), so a
 * scenario written once holds for both cursors' formats.
 */

import { assertEquals, assertInstanceOf } from "@std/assert";
import { Effect, type Layer, Result } from "effect";
import { ConcurrentModificationError } from "./mod.ts";
import { Persistence, type PersistenceError } from "./service.ts";

type Scenario = () => Effect.Effect<void, unknown, Persistence>;

const scenario = (
  title: string,
  body: () => Effect.Effect<void, unknown, Persistence>,
): [string, Scenario] => [title, body];

const roundTrip = scenario("get/set round-trips an entry", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.set(["k1"], "hello");
    const entry = yield* store.get(["k1"]);
    assertEquals(entry?.key, ["k1"]);
    assertEquals(entry?.value, "hello");
    assertEquals(typeof entry?.versionstamp, "string");
  }),
);

const getMissing = scenario("get of a missing key returns undefined", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    assertEquals(yield* store.get(["missing"]), undefined);
  }),
);

const deleteRemoves = scenario("delete removes the key", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.set(["k1"], "hello");
    yield* store.delete(["k1"]);
    assertEquals(yield* store.get(["k1"]), undefined);
  }),
);

const freshVersionstamp = scenario("set assigns a fresh versionstamp", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.set(["k"], "v1");
    const v1 = (yield* store.get(["k"]))?.versionstamp;
    yield* store.set(["k"], "v2");
    const v2 = (yield* store.get(["k"]))?.versionstamp;
    assertEquals((yield* store.get(["k"]))?.value, "v2");
    assertEquals(v1 === v2, false);
  }),
);

const getMany = scenario("getMany reads multiple keys", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.set(["a"], 1);
    yield* store.set(["b"], 2);
    const results = yield* store.getMany([["a"], ["b"], ["missing"]]);
    assertEquals(
      results.map((e) => e?.value),
      [1, 2, undefined],
    );
  }),
);

const listSorted = scenario(
  "list sorts under a prefix, other prefixes out",
  () =>
    Effect.gen(function* () {
      const store = yield* Persistence;
      yield* store.set(["file:latest", "c"], 3);
      yield* store.set(["file:latest", "a"], 1);
      yield* store.set(["file:latest", "b"], 2);
      yield* store.set(["mark", "1"], "z");
      const { entries } = yield* store.list<number>(["file:latest"]);
      assertEquals(
        entries.map((e) => e.key),
        [
          ["file:latest", "a"],
          ["file:latest", "b"],
          ["file:latest", "c"],
        ],
      );
      assertEquals(
        entries.map((e) => e.value),
        [1, 2, 3],
      );
    }),
);

const listEverything = scenario("an empty prefix returns everything", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.set(["a"], 1);
    yield* store.set(["b"], 2);
    const { entries } = yield* store.list([]);
    assertEquals(entries.map((e) => e.value).sort(), [1, 2]);
  }),
);

const listReverse = scenario("list reverse iterates descending", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    for (const [name, n] of [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ] as const) {
      yield* store.set(["file:latest", name], n);
    }
    const { entries } = yield* store.list(["file:latest"], { reverse: true });
    assertEquals(
      entries.map((e) => e.value),
      [3, 2, 1],
    );
  }),
);

const listPaginated = scenario("list paginates by limit via cursor", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    for (const name of ["a", "b", "c", "d", "e"]) {
      yield* store.set(["file:latest", name], name);
    }

    const page1 = yield* store.list<string>(["file:latest"], { limit: 2 });
    assertEquals(
      page1.entries.map((e) => e.value),
      ["a", "b"],
    );
    assertEquals(page1.cursor !== undefined, true);

    const page2 = yield* store.list<string>(["file:latest"], {
      limit: 2,
      cursor: page1.cursor,
    });
    assertEquals(
      page2.entries.map((e) => e.value),
      ["c", "d"],
    );

    const page3 = yield* store.list<string>(["file:latest"], {
      limit: 2,
      cursor: page2.cursor,
    });
    assertEquals(
      page3.entries.map((e) => e.value),
      ["e"],
    );
    assertEquals(page3.cursor, undefined);
  }),
);

const batchAtomic = scenario("batch applies multiple writes", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.batch([
      { type: "set", key: ["a"], value: 1 },
      { type: "set", key: ["b"], value: 2 },
      { type: "delete", key: ["c"] },
    ]);
    assertEquals((yield* store.get(["a"]))?.value, 1);
    assertEquals((yield* store.get(["b"]))?.value, 2);
    assertEquals(yield* store.get(["c"]), undefined);
  }),
);

const checkMatches = scenario("a matching versionstamp check commits", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.set(["k"], "v1");
    const entry = yield* store.get(["k"]);
    if (!entry) throw new Error("entry vanished");
    yield* store.batch([{ type: "set", key: ["k"], value: "v2" }], {
      checks: [{ key: ["k"], versionstamp: entry.versionstamp }],
    });
    assertEquals((yield* store.get(["k"]))?.value, "v2");
  }),
);

const checkStale = scenario("a stale check fails the batch, value intact", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.set(["k"], "v1");
    const stale = (yield* store.get(["k"]))?.versionstamp;
    if (!stale) throw new Error("entry vanished");
    yield* store.set(["k"], "v2");

    const outcome = yield* Effect.result(
      store.batch([{ type: "set", key: ["k"], value: "v3" }], {
        checks: [{ key: ["k"], versionstamp: stale }],
      }),
    );
    if (Result.isSuccess(outcome)) {
      throw new Error("a stale check did not conflict");
    }
    assertInstanceOf(outcome.failure, ConcurrentModificationError);
    assertEquals((yield* store.get(["k"]))?.value, "v2");
  }),
);

const checkAbsent = scenario("a null check requires absence", () =>
  Effect.gen(function* () {
    const store = yield* Persistence;
    // Key absent -> check passes.
    yield* store.batch([{ type: "set", key: ["k"], value: "v" }], {
      checks: [{ key: ["k"], versionstamp: null }],
    });
    // Key present -> check fails, value unchanged.
    const outcome = yield* Effect.result(
      store.batch([{ type: "set", key: ["k"], value: "vv" }], {
        checks: [{ key: ["k"], versionstamp: null }],
      }),
    );
    if (Result.isSuccess(outcome)) {
      throw new Error("a null check did not conflict");
    }
    assertInstanceOf(outcome.failure, ConcurrentModificationError);
    assertEquals((yield* store.get(["k"]))?.value, "v");
  }),
);

const SHARED: [string, Scenario][] = [
  roundTrip,
  getMissing,
  deleteRemoves,
  freshVersionstamp,
  getMany,
  listSorted,
  listEverything,
  listReverse,
  listPaginated,
  batchAtomic,
  checkMatches,
  checkStale,
  checkAbsent,
];

type LayerPlan =
  | {
      layer: Layer.Layer<Persistence, PersistenceError>;
      done?: () => Promise<void>;
    }
  | Promise<{
      layer: Layer.Layer<Persistence, PersistenceError>;
      done?: () => Promise<void>;
    }>;

function battery(subject: string, makeLayer: () => LayerPlan): void {
  for (const [title, run] of SHARED) {
    Deno.test(`${subject} -- ${title}`, async () => {
      const { layer, done } = await makeLayer();
      try {
        await Effect.runPromise(Effect.provide(run(), layer));
      } finally {
        await done?.();
      }
    });
  }
}

battery("Persistence.layerMemory", () => ({
  layer: Persistence.layerMemory(),
}));

battery("Persistence.layerKv", async () => {
  // A fresh, isolated local Deno KV (temp dir), released after the test.
  const dir = await Deno.makeTempDir({ prefix: "kvtest_" });
  const kv = await Deno.openKv(`${dir}/kv.sqlite`);
  return {
    layer: Persistence.layerKv(kv),
    done: async () => {
      kv.close();
      await Deno.remove(dir, { recursive: true });
    },
  };
});

// Memory-only behavior of the layer constructor.

Deno.test("Persistence.layerMemory -- initial entries seed the store", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Persistence;
    const entry = yield* store.get(["x"]);
    assertEquals(entry?.value, "1");
  });
  await Effect.runPromise(
    Effect.provide(program, Persistence.layerMemory([[["x"], "1"]])),
  );
});
