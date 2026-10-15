import { Command } from "@cliffy/command";
import type { User } from "@essayist/core";
import type { KvctlGlobals } from "#/globals.ts";
import { listAll, withStore } from "#/kv.ts";

export const listUsers = new Command<KvctlGlobals>()
  .description("List users.")
  .action(({ target, local }) =>
    withStore({ target, local }, async ({ runtime }) => {
      let n = 0;
      for await (const entry of listAll<User>(runtime, ["users"])) {
        const u = entry.value;
        console.log(
          `${u.id}  ${u.email.padEnd(24)}  role=${u.role ?? "writer"}`,
        );
        n++;
      }
      console.log(`(${n} users)`);
    }),
  );
