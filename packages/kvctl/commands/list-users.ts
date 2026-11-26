import { Command } from "@cliffy/command";

import type { KvctlGlobals } from "#/globals.ts";
import { database } from "#/kv.ts";

export const listUsers = new Command<KvctlGlobals>()
  .description("List users.")
  .action(async ({ target, local }) => {
    const { results } = await database({ target, local })
      .prepare("SELECT id, email, role FROM users ORDER BY createdAt")
      .all<{ id: string; email: string; role: string }>();
    for (const u of results) {
      console.log(`${u.id}  ${u.email.padEnd(24)}  role=${u.role}`);
    }
    console.log(`(${results.length} users)`);
  });
