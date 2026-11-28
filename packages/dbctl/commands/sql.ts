import { Command } from "@cliffy/command";
import { pluralize } from "@essayist/core";

import { type DbctlGlobals, withDatabase } from "#/db.ts";
import { pretty } from "#/utils/pretty.ts";

export const sql = new Command<DbctlGlobals>()
  .description("Run a single SQL statement.")
  .arguments("<statement:string>")
  .action((options, statement: string) =>
    withDatabase(options, async (db) => {
      const { results: rows } = await db.prepare(statement).all();
      for (const row of rows) console.log(pretty(row));
      // footer goes to stderr so piped stdout stays pure JSON
      console.error(`(${rows.length} ${pluralize(rows.length, "row", "rows")})`);
    }),
  );
