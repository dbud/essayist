import { Command } from "@cliffy/command";
import type { User } from "@essayist/core";
import type { KvctlGlobals } from "@/globals.ts";
import { withKv } from "@/kv.ts";

export const listUsers = new Command<KvctlGlobals>()
  .description("List users.")
  .action(({ target, local }) =>
    withKv({ target, local }, async ({ kv }) => {
      let n = 0;
      for await (const entry of kv.list<User>({ prefix: ["users"] })) {
        const u = entry.value;
        console.log(`${u.id}  ${u.email}  role=${u.role ?? "writer"}`);
        n++;
      }
      console.log(`(${n} users)`);
    }),
  );
