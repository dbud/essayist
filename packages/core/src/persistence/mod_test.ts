import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import {
  ConcurrentModificationError,
  type Entry,
  InMemoryAdapter,
  type Key,
} from "./mod.ts";

// get / set / delete

Deno.test("InMemoryAdapter -- get/set round-trip returns Entry", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["k1"], "hello");
  const entry = await adapter.get(["k1"]);
  assertEquals(entry?.value, "hello");
  assertEquals(entry?.key, ["k1"] as Key);
  assertEquals(typeof entry?.versionstamp, "string");
});

Deno.test("InMemoryAdapter -- get missing key returns undefined", async () => {
  const adapter = new InMemoryAdapter();
  assertEquals(await adapter.get(["missing"]), undefined);
});

Deno.test("InMemoryAdapter -- delete removes key", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["k1"], "hello");
  await adapter.delete(["k1"]);
  assertEquals(await adapter.get(["k1"]), undefined);
});

Deno.test("InMemoryAdapter -- set assigns a fresh versionstamp", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["k"], "v1");
  const v1 = (await adapter.get(["k"]))?.versionstamp;
  await adapter.set(["k"], "v2");
  const v2 = (await adapter.get(["k"]))?.versionstamp;
  assertStrictEquals((await adapter.get(["k"]))?.value, "v2");
  assertEquals(v1 !== v2, true);
});

// getMany

Deno.test("InMemoryAdapter -- getMany reads multiple keys", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["a"], 1);
  await adapter.set(["b"], 2);
  const results = await adapter.getMany([["a"], ["b"], ["missing"]]);
  assertEquals(results[0]?.value, 1);
  assertEquals(results[1]?.value, 2);
  assertEquals(results[2], undefined);
});

// list

Deno.test("InMemoryAdapter -- list all entries under a prefix", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["file:latest", "a"], "x");
  await adapter.set(["file:latest", "b"], "y");
  await adapter.set(["mark", "1"], "z");
  const { entries } = await adapter.list(["file:latest"]);
  assertEquals(
    entries.map((e) => e.key),
    [
      ["file:latest", "a"],
      ["file:latest", "b"],
    ],
  );
  assertEquals(
    entries.map((e) => e.value),
    ["x", "y"],
  );
});

Deno.test("InMemoryAdapter -- list with empty prefix returns everything", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["a"], 1);
  await adapter.set(["b"], 2);
  const { entries } = await adapter.list([]);
  assertEquals(entries.map((e) => String(e.key[0])).sort(), ["a", "b"]);
});

Deno.test("InMemoryAdapter -- list sorts in ascending tuple order", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["file:latest", "c"], 3);
  await adapter.set(["file:latest", "a"], 1);
  await adapter.set(["file:latest", "b"], 2);
  const { entries } = await adapter.list(["file:latest"]);
  assertEquals(
    entries.map((e) => e.key[1]),
    ["a", "b", "c"],
  );
});

Deno.test("InMemoryAdapter -- list reverse", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["file:latest", "a"], 1);
  await adapter.set(["file:latest", "b"], 2);
  await adapter.set(["file:latest", "c"], 3);
  const { entries } = await adapter.list(["file:latest"], { reverse: true });
  assertEquals(
    entries.map((e) => e.key[1]),
    ["c", "b", "a"],
  );
});

// pagination

Deno.test("InMemoryAdapter -- list with limit paginates via cursor", async () => {
  const adapter = new InMemoryAdapter();
  for (const name of ["a", "b", "c", "d", "e"]) {
    await adapter.set(["file:latest", name], name);
  }

  const page1 = await adapter.list(["file:latest"], { limit: 2 });
  assertEquals(
    page1.entries.map((e) => e.key[1]),
    ["a", "b"],
  );
  assertEquals(page1.cursor !== undefined, true);

  const page2 = await adapter.list(["file:latest"], {
    limit: 2,
    cursor: page1.cursor,
  });
  assertEquals(
    page2.entries.map((e) => e.key[1]),
    ["c", "d"],
  );
  assertEquals(page2.cursor !== undefined, true);

  const page3 = await adapter.list(["file:latest"], {
    limit: 2,
    cursor: page2.cursor,
  });
  assertEquals(
    page3.entries.map((e) => e.key[1]),
    ["e"],
  );
  assertEquals(page3.cursor, undefined);
});

Deno.test("InMemoryAdapter -- list cursor past the last entry returns empty", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["file:latest", "a"], 1);
  await adapter.set(["file:latest", "b"], 2);
  // Cursor pointing at the last entry -> nothing strictly after it.
  const cursor = JSON.stringify(["file:latest", "b"]);
  const after = await adapter.list(["file:latest"], { cursor });
  assertEquals(after.entries, []);
});

// batch

Deno.test("InMemoryAdapter -- batch applies multiple writes atomically", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.batch([
    { type: "set", key: ["a"], value: 1 },
    { type: "set", key: ["b"], value: 2 },
    { type: "delete", key: ["c"] },
  ]);
  assertEquals((await adapter.get(["a"]))?.value, 1);
  assertEquals((await adapter.get(["b"]))?.value, 2);
  assertEquals(await adapter.get(["c"]), undefined);
});

Deno.test("InMemoryAdapter -- batch check passes when versionstamp matches", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["k"], "v1");
  const entry = (await adapter.get(["k"])) as Entry;
  await adapter.batch([{ type: "set", key: ["k"], value: "v2" }], {
    checks: [{ key: ["k"], versionstamp: entry.versionstamp }],
  });
  assertEquals((await adapter.get(["k"]))?.value, "v2");
});

Deno.test("InMemoryAdapter -- batch check fails on stale versionstamp", async () => {
  const adapter = new InMemoryAdapter();
  await adapter.set(["k"], "v1");
  const stale = (await adapter.get(["k"])) as Entry;
  await adapter.set(["k"], "v2"); // bumps versionstamp

  await assertRejects(
    () =>
      adapter.batch([{ type: "set", key: ["k"], value: "v3" }], {
        checks: [{ key: ["k"], versionstamp: stale.versionstamp }],
      }),
    ConcurrentModificationError,
  );
  // Value must be unchanged after a rejected batch.
  assertEquals((await adapter.get(["k"]))?.value, "v2");
});

Deno.test("InMemoryAdapter -- batch check with null versionstamp requires absence", async () => {
  const adapter = new InMemoryAdapter();
  // Key absent -> check passes.
  await adapter.batch([{ type: "set", key: ["k"], value: "v" }], {
    checks: [{ key: ["k"], versionstamp: null }],
  });
  // Key present -> check fails.
  await assertRejects(
    () =>
      adapter.batch([{ type: "set", key: ["k"], value: "vv" }], {
        checks: [{ key: ["k"], versionstamp: null }],
      }),
    ConcurrentModificationError,
  );
  assertEquals((await adapter.get(["k"]))?.value, "v");
});

// constructor

Deno.test("InMemoryAdapter -- constructor from initial entries", async () => {
  const adapter = new InMemoryAdapter([
    [["x"], "1"],
    [["y"], "2"],
  ]);
  assertEquals((await adapter.get(["x"]))?.value, "1");
  assertEquals((await adapter.get(["y"]))?.value, "2");
});
