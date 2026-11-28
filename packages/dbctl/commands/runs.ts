import { Command } from "@cliffy/command";
import { Files, pluralize, ReviewRun, ReviewRuns, WorkspaceId } from "@essayist/core";
import { Console, Effect, Schema } from "effect";

import { type DbctlGlobals, runStore } from "#/db.ts";
import { pretty } from "#/utils/pretty.ts";

const encodeRun = Schema.encodeSync(ReviewRun.json);

export const runs = new Command<DbctlGlobals>()
  .description("List review runs for a workspace, newest first.")
  .arguments("<wsId:string>")
  .option("--path <path:string>", "Only the runs of the file at this path.")
  .action((options, wsId: string) =>
    runStore(
      options,
      Effect.gen(function* () {
        const { path } = options;
        const store = yield* ReviewRuns;
        const list =
          path === undefined
            ? yield* store.listRuns()
            : yield* Effect.flatMap(
                Files.use((files) => files.fileAt(path)),
                (file) => store.listRuns(file.id),
              );
        for (const run of list) yield* Console.log(pretty(encodeRun(run)));
        // footer goes to stderr so piped stdout stays pure JSON
        yield* Console.error(`(${list.length} ${pluralize(list.length, "run", "runs")})`);
      }).pipe(Effect.provideService(WorkspaceId, { wsId })),
    ),
  );
