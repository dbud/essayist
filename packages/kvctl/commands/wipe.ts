import { Command } from "@cliffy/command";
import { type Key, Persistence, type WriteOp } from "@essayist/core";
import { Effect } from "effect";

import type { KvctlGlobals } from "#/globals.ts";
import { listAll, withStore } from "#/kv.ts";

export const wipe = new Command<KvctlGlobals>()
  .description("Delete entries, optionally under a tuple prefix.")
  .arguments("[prefix...:string]")
  .action(({ target, local }, ...prefix: string[]) =>
    withStore({ target, local }, async ({ runtime }) => {
      const keys: Key[] = [];
      for await (const entry of listAll(runtime, prefix)) {
        keys.push(entry.key);
      }
      if (keys.length === 0) {
        console.log("deleted 0 keys");
        return;
      }
      await runtime.runPromise(
        Effect.gen(function* () {
          const store = yield* Persistence;
          yield* store.batch(keys.map((key): WriteOp => ({ type: "delete", key })));
        }),
      );
      console.log(`deleted ${keys.length} keys`);
    }),
  );
