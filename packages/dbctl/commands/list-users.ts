import { Command } from "@cliffy/command";
import { pluralize } from "@essayist/core";

import { type DbctlGlobals, withDatabase } from "#/db.ts";

export const listUsers = new Command<DbctlGlobals>().description("List users.").action((options) =>
  withDatabase(options, async (db) => {
    const { results } = await db
      .prepare("SELECT id, email, role FROM users ORDER BY createdAt")
      .all<{ id: string; email: string; role: string }>();
    for (const user of results) {
      console.log(`${user.id}  ${user.email.padEnd(24)}  role=${user.role}`);
    }
    console.error(`(${results.length} ${pluralize(results.length, "user", "users")})`);
  }),
);
