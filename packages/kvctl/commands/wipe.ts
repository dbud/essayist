import { Command } from "@cliffy/command";
import type { KvctlGlobals } from "@/globals.ts";
import { withKv } from "@/kv.ts";

export const wipe = new Command<KvctlGlobals>()
  .description("Delete keys, optionally under a tuple prefix.")
  .arguments("[prefix...:string]")
  .action(({ target, local }, ...prefix: string[]) =>
    withKv({ target, local }, async ({ kv }) => {
      let n = 0;
      for await (const entry of kv.list({ prefix })) {
        await kv.delete(entry.key);
        n++;
      }
      console.log(`deleted ${n} keys`);
    }),
  );
