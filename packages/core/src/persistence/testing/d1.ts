/** An in-memory SQLite database with the D1 migrations applied, for tests over the D1 layers. */

import { DatabaseSync } from "node:sqlite";

import { migrations } from "@essayist/core/migrations";

export function migratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const { sql } of migrations) db.exec(sql);
  return db;
}
