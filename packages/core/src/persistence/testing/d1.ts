/** An in-memory SQLite database with the D1 migrations applied, for tests over the D1 layers. */

import { DatabaseSync } from "node:sqlite";

import * as D1Client from "@effect/sql-d1/D1Client";
import { migrations } from "@essayist/core/migrations";
import { Effect, Layer } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";

import { d1SqliteShim } from "#/persistence/kv_d1_sqlite.ts";

export function migratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const { sql } of migrations) db.exec(sql);
  return db;
}

/**
 * Build a D1 layer, such as `layerWorkspacesD1`, for a test: the layer gets its own in-memory
 * database with the migrations applied, closed when the test releases the layer.
 */
export function testLayerD1<S, E>(make: (client: D1Client.D1Client) => Layer.Layer<S, E>) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const db = yield* Effect.acquireRelease(Effect.sync(migratedDatabase), (opened) =>
        Effect.sync(() => opened.close()),
      );
      return make(yield* D1Client.make({ db: d1SqliteShim(db) }));
    }),
  ).pipe(Layer.provide(Reactivity.layer));
}
