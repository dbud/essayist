/**
 * A `D1Database`-shaped shim over `node:sqlite` for tests: the same
 * prepare/bind surface the worker binding implements. Batches run in a
 * transaction and stop on the first failing statement, mirroring D1.
 */

import type { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";

type MaybeResult<T> = {
  results?: T[];
  error?: unknown;
};

/** Node's SQLInputValue; our statements only carry typed text and numbers. */
type SqlParam = string | number | bigint | Uint8Array | null;

export function d1SqliteShim(db: DatabaseSync): D1Database {
  const statement = (sql: string, values: ReadonlyArray<SqlParam> = []) => ({
    bind: (...next: ReadonlyArray<SqlParam>) => statement(sql, next),
    all: async <T = Record<string, unknown>>(): Promise<MaybeResult<T>> => {
      try {
        const rows = db.prepare(sql).all(...values);
        return { results: rows as T[] };
      } catch (error) {
        return { error };
      }
    },
    raw: async (): Promise<unknown[][]> => {
      const rows = db.prepare(sql).all(...values);
      return rows.map((row) => Object.values(row as Record<string, unknown>));
    },
  });

  return {
    prepare: (sql: string) => statement(sql),
    batch: async <T = Record<string, unknown>>(
      statements: Array<ReturnType<typeof statement>>,
    ): Promise<MaybeResult<T>[]> => {
      const responses: MaybeResult<T>[] = [];
      db.exec("BEGIN");
      for (const stmt of statements) {
        const response = await stmt.all<T>();
        if (response.error !== undefined) {
          db.exec("ROLLBACK");
          responses.push(response);
          return responses;
        }
        responses.push(response);
      }
      db.exec("COMMIT");
      return responses;
    },
  } as unknown as D1Database;
}
