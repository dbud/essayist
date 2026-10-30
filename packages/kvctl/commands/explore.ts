import { Command } from "@cliffy/command";
import { pluralize } from "@essayist/core";

import type { KvctlGlobals } from "#/globals.ts";
import { listAll, withStore } from "#/kv.ts";
import { pprint } from "#/utils/pprint.ts";

export const explore = new Command<KvctlGlobals>()
  .description("List entries, optionally under a tuple prefix.")
  .arguments("[prefix...:string]")
  .action(({ target, local }, ...prefix: string[]) =>
    withStore({ target, local }, async ({ runtime }) => {
      let n = 0;
      for await (const entry of listAll(runtime, prefix)) {
        n++;
        pprint([entry.key, entry.value]);
      }
      // footer goes to stderr so piped stdout stays pure JSON
      console.error(`(${n} ${pluralize(n, "entry", "entries")})`);
    }),
  );
