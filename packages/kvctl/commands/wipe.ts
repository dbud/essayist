import { Command } from "@cliffy/command";
import { withKv } from "@/kv.ts";

export const wipe = new Command<{ target?: string }>()
  .description("Delete every key.")
  .action(({ target }) =>
    withKv(target, async ({ kv }) => {
      let n = 0;
      for await (const entry of kv.list({ prefix: [] })) {
        await kv.delete(entry.key);
        n++;
      }
      console.log(`deleted ${n} keys`);
    }),
  );
