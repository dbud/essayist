import { assertEquals, assertStrictEquals } from "@std/assert";
import { InMemoryAdapter } from "./persistence.ts";

Deno.test("InMemoryAdapter -- get/set round-trip", () => {
  const adapter = new InMemoryAdapter();
  adapter.set("key1", "hello");
  assertEquals(adapter.get("key1"), "hello");
});

Deno.test("InMemoryAdapter -- get missing key returns undefined", () => {
  const adapter = new InMemoryAdapter();
  assertEquals(adapter.get("missing"), undefined);
});

Deno.test("InMemoryAdapter -- delete removes key", () => {
  const adapter = new InMemoryAdapter();
  adapter.set("key1", "hello");
  adapter.delete("key1");
  assertEquals(adapter.get("key1"), undefined);
});

Deno.test("InMemoryAdapter -- list all keys", () => {
  const adapter = new InMemoryAdapter();
  adapter.set("a", 1);
  adapter.set("b", 2);
  adapter.set("c", 3);
  const keys = [...adapter.list()].sort();
  assertEquals(keys, ["a", "b", "c"]);
});

Deno.test("InMemoryAdapter -- list with prefix", () => {
  const adapter = new InMemoryAdapter();
  adapter.set("file:a", "x");
  adapter.set("file:b", "y");
  adapter.set("mark:1", "z");
  const keys = [...adapter.list("file:")];
  assertEquals(keys, ["file:a", "file:b"]);
});

Deno.test("InMemoryAdapter -- constructor from Record", () => {
  const adapter = new InMemoryAdapter({ x: "1", y: "2" });
  assertEquals(adapter.get("x"), "1");
  assertEquals(adapter.get("y"), "2");
});

Deno.test("InMemoryAdapter -- constructor from Map", () => {
  const map = new Map<string, unknown>([["a", "val"]]);
  const adapter = new InMemoryAdapter(map);
  assertEquals(adapter.get("a"), "val");
});

Deno.test("InMemoryAdapter -- store accessor", () => {
  const adapter = new InMemoryAdapter();
  adapter.set("k", "v");
  assertStrictEquals(adapter.store.get("k"), "v");
});
