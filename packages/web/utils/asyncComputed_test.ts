import { computed, signal } from "@preact/signals";
import { assertEquals } from "@std/assert";
import { asyncComputed } from "./asyncComputed.ts";

const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

Deno.test("asyncComputed -- initial value is available synchronously", () => {
  const s = signal(1);
  const c = asyncComputed(
    () => s.value,
    (n) => Promise.resolve(n * 10),
    {
      initial: -1,
      debounce: 5,
    },
  );
  assertEquals(c.value.value, -1);
});

Deno.test("asyncComputed -- first compute populates value", async () => {
  const s = signal(1);
  const c = asyncComputed(
    () => s.value,
    (n) => Promise.resolve(n * 10),
    {
      initial: -1,
      debounce: 5,
    },
  );
  await tick(20);
  assertEquals(c.value.value, 10);
});

Deno.test("asyncComputed -- compute is debounced, not per change", async () => {
  const s = signal(0);
  let runs = 0;
  const c = asyncComputed(
    () => s.value,
    (n) => {
      runs++;
      return Promise.resolve(n);
    },
    { initial: -1, debounce: 20 },
  );
  const firstRuns = runs; // first run fires immediately
  s.value = 1;
  s.value = 2;
  s.value = 3;
  await tick(40);
  assertEquals(runs, firstRuns + 1); // one debounced run with the latest deps
  assertEquals(c.value.value, 3);
});

Deno.test("asyncComputed -- holds last value and sets stale while pending", async () => {
  const s = signal("a");
  const c = asyncComputed(
    () => s.value,
    (v) => Promise.resolve(v),
    {
      initial: "",
      debounce: 20,
    },
  );
  await tick(5); // first compute resolves
  assertEquals(c.value.value, "a");
  assertEquals(c.stale.value, false);
  s.value = "b";
  await tick(0); // let the effect run: set stale, schedule the debounced compute
  assertEquals(c.value.value, "a"); // debounced: still the old value
  assertEquals(c.stale.value, true); // pending
  await tick(40);
  assertEquals(c.value.value, "b");
  assertEquals(c.stale.value, false);
});

Deno.test("asyncComputed -- drops stale responses", async () => {
  const s = signal(0);
  // Slow compute whose latency grows with the value, so an older request can
  // resolve after a newer one if not guarded.
  const c = asyncComputed(
    () => s.value,
    async (n) => {
      await tick(n === 1 ? 40 : 5);
      return n;
    },
    { initial: -1, debounce: 0 },
  );
  await tick(5);
  s.value = 1; // slow request
  s.value = 2; // fast request, supersedes
  await tick(60);
  assertEquals(c.value.value, 2); // not the stale "1"
});

Deno.test("asyncComputed -- downstream deep-equality suppression", async () => {
  const s = signal([1, 2]);
  const c = asyncComputed(
    () => s.value,
    (arr) => Promise.resolve([...arr]),
    {
      initial: [] as number[],
      debounce: 20,
    },
  );
  await tick(5); // let the first compute resolve so priming captures the real value

  let downstreamRuns = 0;
  const downstream = computed(() => {
    downstreamRuns++;
    return c.value.value;
  });
  downstream.value; // prime
  assertEquals(downstreamRuns, 1);

  s.value = [1, 2]; // deeply equal -> no refire
  await tick(40);
  assertEquals(downstream.value, [1, 2]);
  assertEquals(downstreamRuns, 1);

  s.value = [1, 3]; // structural change -> refire
  await tick(40);
  assertEquals(downstream.value, [1, 3]);
  assertEquals(downstreamRuns, 2);
});
