import { computed, signal } from "@preact/signals";
import { assertEquals } from "@std/assert";
import { asyncComputed } from "./asyncComputed.ts";

const tick = () => new Promise<void>((r) => queueMicrotask(r));

function manualTimers() {
  const scheduled = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;

  const schedule = (fn: () => void, ms: number): (() => void) => {
    const id = next++;
    scheduled.set(id, { fn, ms });
    return () => {
      scheduled.delete(id);
    };
  };

  const pending = () => [...scheduled.values()];

  const fire = (): void => {
    const entries = [...scheduled.values()];
    scheduled.clear();
    for (const entry of entries) entry.fn();
  };

  const drain = async (): Promise<void> => {
    for (let guard = 0; guard < 50 && scheduled.size > 0; guard++) {
      fire();
      await tick();
    }
  };

  return { schedule, pending, fire, drain };
}

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
  const timers = manualTimers();
  const c = asyncComputed(
    () => s.value,
    (n) => Promise.resolve(n * 10),
    {
      initial: -1,
      debounce: 5,
      schedule: timers.schedule,
    },
  );
  assertEquals(timers.pending().length, 0);
  await tick();
  assertEquals(c.value.value, 10);
});

Deno.test("asyncComputed -- compute is debounced, not per change", async () => {
  const s = signal(0);
  let runs = 0;
  const timers = manualTimers();
  const c = asyncComputed(
    () => s.value,
    (n) => {
      runs++;
      return Promise.resolve(n);
    },
    {
      initial: -1,
      debounce: 5,
      schedule: timers.schedule,
    },
  );
  const firstRuns = runs; // first run fires immediately

  s.value = 1;
  s.value = 2;
  s.value = 3;
  await tick();

  assertEquals(timers.pending().length, 1);
  assertEquals(timers.pending()[0].ms, 5);

  timers.fire();
  await tick();
  assertEquals(runs, firstRuns + 1); // one debounced run with the latest deps
  assertEquals(c.value.value, 3);
});

Deno.test("asyncComputed -- holds last value and sets stale while pending", async () => {
  const s = signal("a");
  const timers = manualTimers();
  const c = asyncComputed(
    () => s.value,
    (v) => Promise.resolve(v),
    {
      initial: "",
      debounce: 5,
      schedule: timers.schedule,
    },
  );
  await tick(); // first compute resolves
  assertEquals(c.value.value, "a");
  assertEquals(c.stale.value, false);

  s.value = "b";
  await tick(); // let the effect run: set stale, schedule the debounced compute
  assertEquals(c.value.value, "a"); // debounced: still the old value
  assertEquals(c.stale.value, true); // pending

  timers.fire();
  await tick();
  assertEquals(c.value.value, "b");
  assertEquals(c.stale.value, false);
});

Deno.test("asyncComputed -- drops stale responses", async () => {
  const s = signal(0);
  const timers = manualTimers();
  const c = asyncComputed(
    () => s.value,
    (n) =>
      new Promise<number>((resolve) => {
        timers.schedule(() => resolve(n), 5);
      }),
    {
      initial: -1,
      debounce: 0,
      schedule: timers.schedule,
    },
  );
  await tick(); // let compute(0) start

  s.value = 1; // slow request
  s.value = 2; // fast request, supersedes
  await tick();
  await timers.drain();

  assertEquals(c.value.value, 2); // not the stale "0"
});

Deno.test("asyncComputed -- aborts in-flight compute when superseded", async () => {
  const s = signal(0);
  const aborted: number[] = [];
  const timers = manualTimers();

  const c = asyncComputed(
    () => s.value,
    (n, signal) =>
      new Promise<number>((resolve, reject) => {
        const cancel = timers.schedule(() => resolve(n), 15);
        signal.addEventListener(
          "abort",
          () => {
            cancel();
            aborted.push(n);
            reject(new DOMException("aborted", "AbortError"));
          },
          { once: true },
        );
      }),
    {
      initial: -1,
      debounce: 0,
      schedule: timers.schedule,
    },
  );

  await tick(); // let compute(0) start
  s.value = 1; // supersede while compute(0) is in-flight
  await tick();
  await timers.drain();

  assertEquals(c.value.value, 1);
  assertEquals(aborted, [0]);
  assertEquals(c.stale.value, false);
});

Deno.test("asyncComputed -- downstream deep-equality suppression", async () => {
  const s = signal([1, 2]);
  const timers = manualTimers();
  const c = asyncComputed(
    () => s.value,
    (arr) => Promise.resolve([...arr]),
    {
      initial: [] as number[],
      debounce: 5,
      schedule: timers.schedule,
    },
  );
  await tick(); // let the first compute resolve so priming captures the real value

  let downstreamRuns = 0;
  const downstream = computed(() => {
    downstreamRuns++;
    return c.value.value;
  });
  downstream.value; // prime
  assertEquals(downstreamRuns, 1);

  s.value = [1, 2]; // deeply equal -> no refire
  await timers.drain();
  assertEquals(downstream.value, [1, 2]);
  assertEquals(downstreamRuns, 1);

  s.value = [1, 3]; // structural change -> refire
  await timers.drain();
  assertEquals(downstream.value, [1, 3]);
  assertEquals(downstreamRuns, 2);
});
