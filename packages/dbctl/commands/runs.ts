import { Command } from "@cliffy/command";
import { Files, pluralize, ReviewRun, ReviewRuns, WorkspaceId } from "@essayist/core";
import { Effect, Result, Schema } from "effect";

import { withStore } from "#/db.ts";
import type { DbctlGlobals } from "#/globals.ts";
import { pprint } from "#/utils/pprint.ts";

const encodeRun = Schema.encodeSync(ReviewRun.json);

export const runs = new Command<DbctlGlobals>()
  .description("List review runs for a workspace, newest first.")
  .arguments("<wsId:string>")
  .option("--path <path:string>", "Only the runs of the file at this path.")
  .action(({ remote, path }, wsId: string) =>
    withStore({ remote }, async ({ runtime }) => {
      const listed = await runtime.runPromise(
        Effect.gen(function* () {
          const store = yield* ReviewRuns;
          if (path === undefined) return yield* store.listRuns();
          const file = yield* Files.use((files) => files.fileAt(path));
          return yield* store.listRuns(file.id);
        }).pipe(Effect.provideService(WorkspaceId, { wsId }), Effect.result),
      );
      if (Result.isFailure(listed)) {
        console.error(listed.failure.message);
        process.exitCode = 1;
        return;
      }
      const list = listed.success;
      for (const run of list) pprint(encodeRun(run));
      // footer goes to stderr so piped stdout stays pure JSON
      console.error(`(${list.length} ${pluralize(list.length, "run", "runs")})`);
    }),
  );
