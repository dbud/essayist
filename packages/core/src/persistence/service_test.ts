import { assertEquals, assertExists, assertInstanceOf } from "@std/assert";
import { Effect, Result } from "effect";
import { ConcurrentModificationError, type PersistenceAdapter } from "./mod.ts";
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

Deno.test("Persistence -- an adapter fault surfaces as PersistenceError", async () => {
  const failing: Partial<PersistenceAdapter> = {
    get: () => Promise.reject(new Error("kv down")),
    batch: () => Promise.reject(new Error("kv down")),
  };
  const program = Effect.gen(function* () {
    const store = yield* Persistence;
    for (const attempt of [
      store.get(["a"]),
      store.batch([{ type: "set", key: ["a"], value: 1 }]),
    ]) {
      const outcome = yield* Effect.result(attempt);
      if (Result.isSuccess(outcome)) {
        throw new Error("a rejecting adapter did not fail");
      }
      assertInstanceOf(outcome.failure, PersistenceError);
    }
  });
  await Effect.runPromise(
    Effect.provide(
      program,
      Persistence.layerFromAdapter(failing as PersistenceAdapter),
    ),
  );
});
