import { Command } from "@cliffy/command";

import { withDatabase } from "#/db.ts";
import type { DbctlGlobals } from "#/globals.ts";

export const listUsers = new Command<DbctlGlobals>()
  .description("List users.")
  .action(({ local }) =>
    withDatabase({ local }, async (db) => {
      const { results } = await db
        .prepare("SELECT id, email, role FROM users ORDER BY createdAt")
        .all<{ id: string; email: string; role: string }>();
      for (const u of results) {
        console.log(`${u.id}  ${u.email.padEnd(24)}  role=${u.role}`);
      }
      console.log(`(${results.length} users)`);
    }),
  );
