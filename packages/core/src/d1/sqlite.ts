/**
 * A `D1Database`-shaped adapter over `node:sqlite`: the local transport for kvctl's `--local` (the
 * vite dev server's own D1 state) and the test shim. Batches run in a transaction and stop on the
 * first failing statement, mirroring D1's all-or-nothing batch. A batch runs synchronously from
 * start to end, so concurrent batches never interleave, as in D1.
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
  const statement = (sql: string, values: ReadonlyArray<SqlParam> = []) => {
    const run = <T>(): MaybeResult<T> => {
      try {
        return { results: db.prepare(sql).all(...values) as T[] };
      } catch (error) {
        return { error };
      }
    };
    return {
      bind: (...next: ReadonlyArray<SqlParam>) => statement(sql, next),
      run,
      all: async <T = Record<string, unknown>>(): Promise<MaybeResult<T>> => run<T>(),
      raw: async (): Promise<unknown[][]> => {
        const rows = db.prepare(sql).all(...values);
        return rows.map((row) => Object.values(row as Record<string, unknown>));
      },
    };
  };

  return {
    prepare: (sql: string) => statement(sql),
    batch: async <T = Record<string, unknown>>(
      statements: Array<ReturnType<typeof statement>>,
    ): Promise<MaybeResult<T>[]> => {
      const responses: MaybeResult<T>[] = [];
      db.exec("BEGIN");
      for (const stmt of statements) {
        const response = stmt.run<T>();
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
