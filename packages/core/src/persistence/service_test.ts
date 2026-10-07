import { assertEquals, assertExists, assertInstanceOf } from "@std/assert";
import { Effect, Result } from "effect";
import { kvLayer } from "./kv_layer.ts";
import { ConcurrentModificationError } from "./mod.ts";
import { Persistence, PersistenceError } from "./service.ts";

Deno.test("Persistence -- entries round-trip through the memory layer", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.set(["n", "a"], { v: 1 });

    const entry = yield* store.get<{ v: number }>(["n", "a"]);
    assertEquals(entry?.key, ["n", "a"]);
    assertEquals(entry?.value, { v: 1 });

    const listed = yield* store.list<{ v: number }>(["n"]);
    assertEquals(
      listed.entries.map((e) => e.value),
      [{ v: 1 }],
    );

    const many = yield* store.getMany<{ v: number }>([
      ["n", "a"],
      ["n", "b"],
    ]);
    assertEquals(
      many.map((e) => e?.value),
      [{ v: 1 }, undefined],
    );

    yield* store.delete(["n", "a"]);
    const gone = yield* store.get(["n", "a"]);
    assertEquals(gone, undefined);
  });
  await Effect.runPromise(Effect.provide(program, Persistence.layerMemory()));
});

Deno.test("Persistence -- list forwards the page limit and cursor", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.set(["n", "a"], 1);
    yield* store.set(["n", "b"], 2);

    const first = yield* store.list(["n"], { limit: 1 });
    assertEquals(
      first.entries.map((e) => e.value),
      [1],
    );
    assertExists(first.cursor);

    const second = yield* store.list(["n"], { cursor: first.cursor });
    assertEquals(
      second.entries.map((e) => e.value),
      [2],
    );
    assertEquals(second.cursor, undefined);
  });
  await Effect.runPromise(Effect.provide(program, Persistence.layerMemory()));
});

Deno.test("Persistence -- a stale check fails the batch with ConcurrentModificationError", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Persistence;
    yield* store.set(["k"], 1);
    const outcome = yield* Effect.result(
      store.batch([{ type: "set", key: ["k"], value: 2 }], {
        checks: [{ key: ["k"], versionstamp: "stale" }],
      }),
    );
    if (Result.isSuccess(outcome)) {
      throw new Error("batch with a stale check did not conflict");
    }
    assertInstanceOf(outcome.failure, ConcurrentModificationError);
  });
  await Effect.runPromise(Effect.provide(program, Persistence.layerMemory()));
});

Deno.test("kvLayer -- a rejecting backend maps faults into PersistenceError", async () => {
  // An atomic chain that never commits: exercises the conflict path.
  const atomic = {
    check: () => atomic,
    set: () => atomic,
    delete: () => atomic,
    commit: () => Promise.resolve({ ok: false }),
  };
  const failing = {
    get: () => Promise.reject(new Error("kv down")),
    atomic: () => atomic,
  } as unknown as Deno.Kv;
  const program = Effect.gen(function* () {
    const store = yield* Persistence;

    const read = yield* Effect.result(store.get(["a"]));
    if (Result.isSuccess(read)) {
      throw new Error("a rejecting backend did not fail");
    }
    assertInstanceOf(read.failure, PersistenceError);
    assertEquals(read.failure.message, "the persistence backend failed");
    assertEquals(String(read.failure.cause), "Error: kv down");

    const write = yield* Effect.result(
      store.batch([{ type: "set", key: ["a"], value: 1 }]),
    );
    if (Result.isSuccess(write)) {
      throw new Error("a rejected commit did not conflict");
    }
    assertInstanceOf(write.failure, ConcurrentModificationError);
  });
  await Effect.runPromise(Effect.provide(program, kvLayer(failing)));
});
