import { Command } from "@cliffy/command";
import { pluralize } from "@essayist/core";
import { printEntry, withKv } from "@/kv.ts";

export const explore = new Command<{ target?: string }>()
  .description("List keys, optionally under a tuple prefix.")
  .arguments("[prefix...:string]")
  .action(({ target }, ...prefix: string[]) =>
    withKv(target, async ({ kv }) => {
      let n = 0;
      for await (const entry of kv.list({ prefix })) {
        n++;
        printEntry(entry);
      }
      // footer goes to stderr so piped stdout stays pure JSON
      console.error(`(${n} ${pluralize(n, "entry", "entries")})`);
    }),
  );
