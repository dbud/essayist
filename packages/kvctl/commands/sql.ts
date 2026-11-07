import { Command } from "@cliffy/command";

import type { KvctlGlobals } from "#/globals.ts";
import { database } from "#/kv.ts";
import { pprint } from "#/utils/pprint.ts";

export const sql = new Command<KvctlGlobals>()
  .description("Run one raw SQL statement against the review D1 database.")
  .arguments("<statement:string>")
  .action(async ({ local, target }, statement: string) => {
    const response = (await database({ local, target }).prepare(statement).all()) as {
      results?: Record<string, unknown>[];
      error?: unknown;
    };
    if (response.error !== undefined) {
      console.error(JSON.stringify(response.error));
      process.exit(1);
    }
    const rows = response.results ?? [];
    for (const row of rows) {
      pprint(row);
    }
    // footer goes to stderr so piped stdout stays pure JSON
    console.error(`(${rows.length} ${rows.length === 1 ? "row" : "rows"})`);
  });
