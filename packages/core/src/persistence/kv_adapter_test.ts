import { assertEquals, assertRejects } from "@std/assert";
import { KvAdapter } from "./kv_adapter.ts";
import { ConcurrentModificationError, type Entry, type Key } from "./mod.ts";

const kvAvailable = typeof Deno.openKv === "function";

/**
 * Run a test against a fresh, isolated ephemeral KV with the handle closed
 * afterwards. Tests skip when KV is unavailable.
 */
function kvTest(name: string, fn: (adapter: KvAdapter) => Promise<void>): void {
  Deno.test({
    name,
    ignore: !kvAvailable,
    fn: async () => {
      const kv = await Deno.openKv(":memory:");
      try {
        await fn(new KvAdapter(kv));
      } finally {
        kv.close();
      }
    },
  });
}

kvTest("KvAdapter -- get/set round-trip returns Entry", async (a) => {
  await a.set(["k1"], "hello");
  const entry = await a.get(["k1"]);
  assertEquals(entry?.value, "hello");
  assertEquals(entry?.key, ["k1"] as Key);
  assertEquals(typeof entry?.versionstamp, "string");
});

kvTest("KvAdapter -- get missing returns undefined", async (a) => {
  assertEquals(await a.get(["missing"]), undefined);
});

kvTest("KvAdapter -- delete removes key", async (a) => {
  await a.set(["k1"], "hello");
  await a.delete(["k1"]);
  assertEquals(await a.get(["k1"]), undefined);
});

kvTest("KvAdapter -- getMany reads multiple keys", async (a) => {
  await a.set(["a"], 1);
  await a.set(["b"], 2);
  const results = await a.getMany([["a"], ["b"], ["missing"]]);
  assertEquals(results[0]?.value, 1);
  assertEquals(results[1]?.value, 2);
  assertEquals(results[2], undefined);
});

kvTest("KvAdapter -- list under a prefix, sorted", async (a) => {
  await a.set(["file:latest", "c"], 3);
  await a.set(["file:latest", "a"], 1);
  await a.set(["file:latest", "b"], 2);
  await a.set(["mark", "1"], "z");
  const { entries } = await a.list(["file:latest"]);
  assertEquals(
    entries.map((e) => String(e.key[1])),
    ["a", "b", "c"],
  );
});

kvTest("KvAdapter -- list reverse", async (a) => {
  await a.set(["file:latest", "a"], 1);
  await a.set(["file:latest", "b"], 2);
  await a.set(["file:latest", "c"], 3);
  const { entries } = await a.list(["file:latest"], { reverse: true });
  assertEquals(
    entries.map((e) => String(e.key[1])),
    ["c", "b", "a"],
  );
});

kvTest("KvAdapter -- an empty prefix returns everything", async (a) => {
  await a.set(["a"], 1);
  await a.set(["b"], 2);
  const { entries } = await a.list([]);
  assertEquals(entries.map((e) => e.value).sort(), [1, 2]);
});

kvTest("KvAdapter -- list paginates by limit via cursor", async (a) => {
  for (const name of ["a", "b", "c", "d", "e"]) {
    await a.set(["file:latest", name], name);
  }

  const page1 = await a.list<string>(["file:latest"], { limit: 2 });
  assertEquals(
    page1.entries.map((e) => e.value),
    ["a", "b"],
  );
  assertEquals(page1.cursor !== undefined, true);

  const page2 = await a.list<string>(["file:latest"], {
    limit: 2,
    cursor: page1.cursor,
  });
  assertEquals(
    page2.entries.map((e) => e.value),
    ["c", "d"],
  );

  const page3 = await a.list<string>(["file:latest"], {
    limit: 2,
    cursor: page2.cursor,
  });
  assertEquals(
    page3.entries.map((e) => e.value),
    ["e"],
  );
  assertEquals(page3.cursor, undefined);
});

kvTest("KvAdapter -- batch applies multiple writes atomically", async (a) => {
  await a.batch([
    { type: "set", key: ["a"], value: 1 },
    { type: "set", key: ["b"], value: 2 },
    { type: "delete", key: ["c"] },
  ]);
  assertEquals((await a.get(["a"]))?.value, 1);
  assertEquals((await a.get(["b"]))?.value, 2);
  assertEquals(await a.get(["c"]), undefined);
});

kvTest(
  "KvAdapter -- batch check passes when versionstamp matches",
  async (a) => {
    await a.set(["k"], "v1");
    const entry = (await a.get(["k"])) as Entry;
    await a.batch([{ type: "set", key: ["k"], value: "v2" }], {
      checks: [{ key: ["k"], versionstamp: entry.versionstamp }],
    });
    assertEquals((await a.get(["k"]))?.value, "v2");
  },
);

kvTest("KvAdapter -- batch check fails on stale versionstamp", async (a) => {
  await a.set(["k"], "v1");
  const stale = (await a.get(["k"])) as Entry;
  await a.set(["k"], "v2"); // bumps versionstamp

  await assertRejects(
    () =>
      a.batch([{ type: "set", key: ["k"], value: "v3" }], {
        checks: [{ key: ["k"], versionstamp: stale.versionstamp }],
      }),
    ConcurrentModificationError,
  );
  assertEquals((await a.get(["k"]))?.value, "v2");
});

kvTest("KvAdapter -- null check requires absence", async (a) => {
  await a.batch([{ type: "set", key: ["k"], value: "v" }], {
    checks: [{ key: ["k"], versionstamp: null }],
  });
  await assertRejects(
    () =>
      a.batch([{ type: "set", key: ["k"], value: "vv" }], {
        checks: [{ key: ["k"], versionstamp: null }],
      }),
    ConcurrentModificationError,
  );
  assertEquals((await a.get(["k"]))?.value, "v");
});
