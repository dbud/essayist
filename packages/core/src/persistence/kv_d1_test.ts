/**
 * The Persistence scenario battery against the D1 layer, via the
 * `node:sqlite` shim standing in for the worker's `D1Database` binding.
 */

import { DatabaseSync } from "node:sqlite";
import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { test } from "vitest";
import { KV_D1_SCHEMA, layerKvD1 } from "./kv_d1.ts";
import { d1SqliteShim } from "./kv_d1_sqlite.ts";
import { SCENARIOS } from "./scenarios.ts";

for (const [title, run] of SCENARIOS) {
  test(`layerKvD1 -- ${title}`, async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(KV_D1_SCHEMA);
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* D1Client.make({ db: d1SqliteShim(db) });
          yield* Effect.provide(run(), layerKvD1(client));
        }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)),
      );
    } finally {
      db.close();
    }
  });
}
