import { Command } from "@cliffy/command";
import { pluralize } from "@essayist/core";
import type { KvctlGlobals } from "@/globals.ts";
import { withKv } from "@/kv.ts";
import { pprint } from "@/utils/pprint.ts";

export const explore = new Command<KvctlGlobals>()
  .description("List keys, optionally under a tuple prefix.")
  .arguments("[prefix...:string]")
  .action(({ target, local }, ...prefix: string[]) =>
    withKv({ target, local }, async ({ kv }) => {
      let n = 0;
      for await (const entry of kv.list({ prefix })) {
        n++;
        pprint([entry.key, entry.value]);
      }
      // footer goes to stderr so piped stdout stays pure JSON
      console.error(`(${n} ${pluralize(n, "entry", "entries")})`);
    }),
  );
