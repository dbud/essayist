import { Command } from "@cliffy/command";

import { withDatabase } from "#/db.ts";
import type { DbctlGlobals } from "#/globals.ts";
import { pprint } from "#/utils/pprint.ts";

export const sql = new Command<DbctlGlobals>()
  .description("Run one raw SQL statement against the review D1 database.")
  .arguments("<statement:string>")
  .action(({ local }, statement: string) =>
    withDatabase({ local }, async (db) => {
      const { results: rows } = await db.prepare(statement).all();
      for (const row of rows) {
        pprint(row);
      }
      // footer goes to stderr so piped stdout stays pure JSON
      console.error(`(${rows.length} ${rows.length === 1 ? "row" : "rows"})`);
    }),
  );
