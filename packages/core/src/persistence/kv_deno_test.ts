import type { Kv } from "@deno/kv";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { Effect, Result } from "effect";
import { test } from "vitest";
import { kvLayer } from "./kv_layer.ts";
import { ConcurrentModificationError } from "./mod.ts";
import { Persistence, PersistenceError } from "./service.ts";

test("kvLayer -- a rejecting backend maps faults into PersistenceError", async () => {
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
  } as unknown as Kv;
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
