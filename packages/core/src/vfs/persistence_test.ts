import { assertEquals, assertStrictEquals } from "@std/assert";
import { InMemoryAdapter } from "./persistence.ts";

Deno.test("InMemoryAdapter -- get/set round-trip", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set("key1", "hello");
  assertEquals(await adapter.get("key1"), "hello");
});

Deno.test("InMemoryAdapter -- get missing key returns undefined", async () => {
  const adapter = new InMemoryAdapter();
  assertEquals(await adapter.get("missing"), undefined);
});

Deno.test("InMemoryAdapter -- delete removes key", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set("key1", "hello");
  await adapter.delete("key1");
  assertEquals(await adapter.get("key1"), undefined);
});

Deno.test("InMemoryAdapter -- list all keys", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set("a", 1);
  await adapter.set("b", 2);
  await adapter.set("c", 3);
  const keys: string[] = [];
  for await (const key of adapter.list()) {
    keys.push(key);
  }
  keys.sort();
  assertEquals(keys, ["a", "b", "c"]);
});

Deno.test("InMemoryAdapter -- list with prefix", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set("file:latest:a", "x");
  await adapter.set("file:latest:b", "y");
  await adapter.set("mark:1", "z");
  const keys: string[] = [];
  for await (const key of adapter.list("file:")) {
    keys.push(key);
  }
  keys.sort();
  assertEquals(keys, ["file:latest:a", "file:latest:b"]);
});

Deno.test("InMemoryAdapter -- constructor from Record", async () => {
  const adapter = new InMemoryAdapter({ x: "1", y: "2" });
  assertEquals(await adapter.get("x"), "1");
  assertEquals(await adapter.get("y"), "2");
});

Deno.test("InMemoryAdapter -- constructor from Map", async () => {
  const map = new Map<string, unknown>([["a", "val"]]);
  const adapter = new InMemoryAdapter(map);
  assertEquals(await adapter.get("a"), "val");
});

Deno.test("InMemoryAdapter -- store accessor", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set("k", "v");
  assertStrictEquals(adapter.store.get("k"), "v");
});
