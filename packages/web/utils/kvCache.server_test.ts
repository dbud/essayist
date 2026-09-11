import { assertEquals } from "@std/assert";
import { delay } from "@/utils/delay.ts";
import { cached } from "@/utils/kvCache.server.ts";

/** Loads resolve to distinct "v1", "v2", ... values so value assertions
 * never read like counts; `loads()` counts load invocations. */
function versionedLoader() {
  let n = 0;
  return {
    load: () => Promise.resolve(`v${++n}`),
    get loads() {
      return n;
    },
  };
}

Deno.test("kvCache -- cold miss loads once and reuses the value", async () => {
  const loader = versionedLoader();
  const cache = cached("test", loader.load, { ttlMs: 60_000 });
  assertEquals(await cache.get(), "v1");
  assertEquals(await cache.get(), "v1");
  assertEquals(loader.loads, 1);
});

Deno.test("kvCache -- concurrent misses share a single load", async () => {
  const loader = versionedLoader();
  const cache = cached("test", loader.load, { ttlMs: 60_000 });
  const [a, b] = await Promise.all([cache.get(), cache.get()]);
  assertEquals(a, "v1");
  assertEquals(b, "v1");
  assertEquals(loader.loads, 1);
});

Deno.test("kvCache -- expired value is refreshed before being served", async () => {
  const loader = versionedLoader();
  const cache = cached("test", loader.load, { ttlMs: 40 });
  assertEquals(await cache.get(), "v1");
  await delay(80);
  // Expired: no stale value is served; concurrent callers share the load.
  const [a, b] = await Promise.all([cache.get(), cache.get()]);
  assertEquals(a, "v2");
  assertEquals(b, "v2");
  assertEquals(loader.loads, 2);
});

Deno.test("kvCache -- invalidate forces the next get to reload", async () => {
  const loader = versionedLoader();
  const cache = cached("test", loader.load, { ttlMs: 60_000 });
  assertEquals(await cache.get(), "v1");
  cache.invalidate();
  assertEquals(await cache.get(), "v2");
  assertEquals(loader.loads, 2);
});

Deno.test("kvCache -- invalidate during a fill discards the fill's result", async () => {
  let n = 0;
  const load = () => Promise.resolve(`v${++n}`);
  const cache = cached("test", load, { ttlMs: 60_000 });
  const first = cache.get();
  // Invalidate while the fill is still in flight (before its callbacks run).
  cache.invalidate();
  // The caller that started before invalidation still resolves...
  assertEquals(await first, "v1");
  // ...but its result must not repopulate the cache.
  assertEquals(await cache.get(), "v2");
});
