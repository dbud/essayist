import { assertEquals } from "@std/assert";
import { delay } from "@/utils/delay.ts";
import { cached } from "@/utils/kvCache.server.ts";
import { bumpKey, watchKey } from "@/utils/kvWatch.server.ts";

/**
 * A watch-capable KV fake mirroring real stream behavior: watch() primes
 * with an aligned batch of every requested key's current value (null when
 * unset), set() delivers one aligned batch per change, and the iterator
 * supports return() so a superseded stream can be released. `requestedKeys`
 * records each watch() call for restart assertions.
 */
function fakeWatchKv() {
  let version = 0;
  const current = new Map<string, string>();
  let keys: Deno.KvKey[] = [];
  let primed = false;
  const requestedKeys: Deno.KvKey[][] = [];
  let notify: ((entries: Deno.KvEntryMaybe<number>[]) => void) | undefined;

  const entryFor = (key: Deno.KvKey): Deno.KvEntryMaybe<number> => {
    const stamp = current.get(JSON.stringify(key));
    if (stamp === undefined) return { key, value: null, versionstamp: null };
    return { key, value: 0, versionstamp: stamp };
  };
  const set = (key: Deno.KvKey) => {
    version++;
    current.set(JSON.stringify(key), String(version).padStart(16, "0"));
    const deliver = notify;
    notify = undefined;
    deliver?.(keys.map(entryFor));
  };
  const kv = {
    watch(requested: readonly Deno.KvKey[]) {
      requestedKeys.push([...requested]);
      keys = [...requested];
      primed = false;
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              if (!primed) {
                primed = true;
                return Promise.resolve({
                  done: false,
                  value: keys.map(entryFor),
                });
              }
              return new Promise((resolve) => {
                notify = (entries) => resolve({ done: false, value: entries });
              });
            },
            return() {
              return Promise.resolve({ done: true, value: undefined });
            },
          };
        },
      };
    },
    set,
  } as unknown as Deno.Kv;
  return { kv, requestedKeys };
}

/** Loads resolve to distinct "v1", "v2", ... values so value assertions
 * never read like counts; `loads` counts load invocations. */
function versionedLoader() {
  let n = 0;
  return {
    load: () => Promise.resolve(`v${++n}`),
    get loads() {
      return n;
    },
  };
}

const EPOCH = ["cache_epoch", "test"] as const;

Deno.test("kvWatch -- cached() drops the cache on a watched epoch bump", async () => {
  const fake = fakeWatchKv();
  const loader = versionedLoader();
  const cache = cached("test", loader.load, {
    ttlMs: 60_000,
    watch: { kv: fake.kv, key: EPOCH },
  });
  assertEquals(await cache.get(), "v1");
  // A bump from another isolate: a new value on the watched key.
  await fake.kv.set(EPOCH, Date.now());
  await delay(1);
  assertEquals(await cache.get(), "v2");
  assertEquals(loader.loads, 2);
});

Deno.test("kvWatch -- cached() ignores the initial delivery of a stream", async () => {
  const loader = versionedLoader();
  const cache = cached("test", loader.load, {
    ttlMs: 60_000,
    watch: { kv: fakeWatchKv().kv, key: EPOCH },
  });
  assertEquals(await cache.get(), "v1");
  await delay(1);
  assertEquals(await cache.get(), "v1");
  assertEquals(loader.loads, 1);
});

Deno.test("kvWatch -- a change fires only that key's callbacks", async () => {
  const fake = fakeWatchKv();
  const fired: string[] = [];
  watchKey(fake.kv, ["cache_epoch", "a"], () => fired.push("a"));
  watchKey(fake.kv, ["cache_epoch", "b"], () => fired.push("b"));
  await delay(1);
  // Priming deliveries reflect stream start and fire nothing.
  assertEquals(fired, []);
  await bumpKey(fake.kv, ["cache_epoch", "a"]);
  await delay(1);
  assertEquals(fired, ["a"]);
  await bumpKey(fake.kv, ["cache_epoch", "b"]);
  await delay(1);
  assertEquals(fired, ["a", "b"]);
});

Deno.test("kvWatch -- a late registration restarts the stream with more keys", async () => {
  const fake = fakeWatchKv();
  watchKey(fake.kv, ["cache_epoch", "a"], () => {});
  await delay(1);
  watchKey(fake.kv, ["cache_epoch", "b"], () => {});
  await delay(1);
  assertEquals(fake.requestedKeys, [
    [["cache_epoch", "a"]],
    [
      ["cache_epoch", "a"],
      ["cache_epoch", "b"],
    ],
  ]);
});
