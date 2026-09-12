import { assertEquals } from "@std/assert";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { UserStateStore } from "./store.ts";

function seed() {
  return new UserStateStore(new InMemoryAdapter());
}

Deno.test("UserStateStore -- selected workspace round-trip", async () => {
  const store = seed();
  assertEquals(await store.getSelectedWorkspace("u1"), undefined);
  await store.setSelectedWorkspace("u1", "ws1");
  assertEquals(await store.getSelectedWorkspace("u1"), "ws1");
  await store.setSelectedWorkspace("u1", "ws2");
  assertEquals(await store.getSelectedWorkspace("u1"), "ws2");
});

Deno.test("UserStateStore -- selected file round-trip, scoped per workspace", async () => {
  const store = seed();
  assertEquals(await store.getSelectedFile("u1", "ws1"), undefined);
  await store.setSelectedFile("u1", "ws1", "essays/a.md");
  await store.setSelectedFile("u1", "ws2", "notes/b.md");
  assertEquals(await store.getSelectedFile("u1", "ws1"), "essays/a.md");
  assertEquals(await store.getSelectedFile("u1", "ws2"), "notes/b.md");
  await store.setSelectedFile("u1", "ws1", "essays/c.md");
  assertEquals(await store.getSelectedFile("u1", "ws1"), "essays/c.md");
});

Deno.test("UserStateStore -- users are isolated", async () => {
  const store = seed();
  await store.setSelectedWorkspace("u1", "ws1");
  await store.setSelectedFile("u1", "ws1", "a.md");
  assertEquals(await store.getSelectedWorkspace("u2"), undefined);
  assertEquals(await store.getSelectedFile("u2", "ws1"), undefined);
});
