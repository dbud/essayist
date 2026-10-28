/**
 * The Persistence scenario battery against the in-memory KV backend of the
 * npm `@deno/kv` client. Cursors are held opaquely (taken from a previous
 * page), so the scenarios describe production behavior.
 */

import { Effect } from "effect";
import { test } from "vitest";

import { SCENARIOS } from "./scenarios.ts";
import { layerKvMemory } from "./testing/kv.ts";

for (const [title, run] of SCENARIOS) {
  test(`layerKvMemory -- ${title}`, async () => {
    // A fresh ephemeral KV per test; the layer owns the connection and
    // closes it at scope end.
    await Effect.runPromise(Effect.provide(run(), layerKvMemory()));
  });
}
