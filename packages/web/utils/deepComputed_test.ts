import { computed, effect, signal } from "@preact/signals";
import { assertEquals } from "@std/assert";
import { deepComputed } from "./deepComputed.ts";

Deno.test("deepComputed -- downstream effect does not re-fire when result is deeply equal", () => {
  const s = signal([1, 2]);
  const c = deepComputed(() => [...s.value]);

  let effectRuns = 0;
  effect(() => {
    effectRuns++;
    c.value;
  });

  assertEquals(effectRuns, 1);

  // New signal reference, but deeply-equal result — effect should not re-fire
  s.value = [1, 2];
  assertEquals(effectRuns, 1);

  // Different value — effect re-fires
  s.value = [1, 3];
  assertEquals(effectRuns, 2);

  // Same value again — no re-fire
  s.value = [1, 3];
  assertEquals(effectRuns, 2);
});

Deno.test("deepComputed -- downstream computed does not re-fire when result is deeply equal", () => {
  const s = signal({ x: 1 });
  const c = deepComputed(() => ({ ...s.value }));

  let downstreamRuns = 0;
  const downstream = computed(() => {
    downstreamRuns++;
    return c.value;
  });

  assertEquals(downstream.value, { x: 1 });
  assertEquals(downstreamRuns, 1);

  s.value = { x: 1 };
  assertEquals(downstream.value, { x: 1 });
  assertEquals(downstreamRuns, 1);

  s.value = { x: 2 };
  assertEquals(downstream.value, { x: 2 });
  assertEquals(downstreamRuns, 2);
});

Deno.test("deepComputed -- multiple downstream effects all suppressed", () => {
  const s = signal([1]);
  const c = deepComputed(() => [...s.value]);

  let runs1 = 0;
  let runs2 = 0;
  effect(() => {
    runs1++;
    c.value;
  });
  effect(() => {
    runs2++;
    c.value;
  });

  assertEquals(runs1, 1);
  assertEquals(runs2, 1);

  s.value = [1];
  assertEquals(runs1, 1);
  assertEquals(runs2, 1);

  s.value = [2];
  assertEquals(runs1, 2);
  assertEquals(runs2, 2);
});

Deno.test("deepComputed -- nested objects are compared deeply", () => {
  const s = signal({ a: { b: 1 } });
  const c = deepComputed(() => ({ ...s.value }));

  let effectRuns = 0;
  effect(() => {
    effectRuns++;
    c.value;
  });

  assertEquals(effectRuns, 1);

  // Same nested structure — no re-fire
  s.value = { a: { b: 1 } };
  assertEquals(effectRuns, 1);

  // Different nested value — re-fires
  s.value = { a: { b: 2 } };
  assertEquals(effectRuns, 2);
});

Deno.test("deepComputed -- returns cached reference when deeply equal", () => {
  const s = signal([1, 2]);
  const c = deepComputed(() => [...s.value]);

  const first = c.value;
  s.value = [1, 2];
  const second = c.value;

  assertEquals(first, second);
});

Deno.test("deepComputed -- returns new reference when value changes", () => {
  const s = signal([1]);
  const c = deepComputed(() => [...s.value]);

  const first = c.value;
  s.value = [2];
  const second = c.value;

  assertEquals(first, [1]);
  assertEquals(second, [2]);
});
