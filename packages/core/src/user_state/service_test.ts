import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import { testLayer } from "@/persistence/testing/kv.ts";
import { UserState } from "./service.ts";

Deno.test("UserState -- selected workspace round-trips", async () => {
  const program = Effect.gen(function* () {
    const store = yield* UserState;
    assertEquals(yield* store.getSelectedWorkspace("u1"), undefined);
    yield* store.setSelectedWorkspace("u1", "ws1");
    assertEquals(yield* store.getSelectedWorkspace("u1"), "ws1");
    yield* store.setSelectedWorkspace("u1", "ws2");
    assertEquals(yield* store.getSelectedWorkspace("u1"), "ws2");
  });
  await Effect.runPromise(
    Effect.provide(program, testLayer(UserState.layerNoDeps)),
  );
});

Deno.test("UserState -- selected file round-trips, scoped per workspace", async () => {
  const program = Effect.gen(function* () {
    const store = yield* UserState;
    assertEquals(yield* store.getSelectedFile("u1", "ws1"), undefined);
    yield* store.setSelectedFile("u1", "ws1", "essays/a.md");
    yield* store.setSelectedFile("u1", "ws2", "notes/b.md");
    assertEquals(yield* store.getSelectedFile("u1", "ws1"), "essays/a.md");
    assertEquals(yield* store.getSelectedFile("u1", "ws2"), "notes/b.md");
    yield* store.setSelectedFile("u1", "ws1", "essays/c.md");
    assertEquals(yield* store.getSelectedFile("u1", "ws1"), "essays/c.md");
  });
  await Effect.runPromise(
    Effect.provide(program, testLayer(UserState.layerNoDeps)),
  );
});

Deno.test("UserState -- users are isolated", async () => {
  const program = Effect.gen(function* () {
    const store = yield* UserState;
    yield* store.setSelectedWorkspace("u1", "ws1");
    yield* store.setSelectedFile("u1", "ws1", "a.md");
    assertEquals(yield* store.getSelectedWorkspace("u2"), undefined);
    assertEquals(yield* store.getSelectedFile("u2", "ws1"), undefined);
  });
  await Effect.runPromise(
    Effect.provide(program, testLayer(UserState.layerNoDeps)),
  );
});
