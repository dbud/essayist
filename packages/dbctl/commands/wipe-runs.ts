import { Command } from "@cliffy/command";
import { Files, pluralize, ReviewRuns, WorkspaceId } from "@essayist/core";
import { Console, Effect } from "effect";

import { type DbctlGlobals, runStore } from "#/db.ts";

export const wipeRuns = new Command<DbctlGlobals>()
  .description("Delete the review runs of a file, with their traces and marks.")
  .arguments("<wsId:string> <path:string>")
  .option("--version <versionId:string>", "Only the runs on this version.")
  .action((options, wsId: string, path: string) =>
    runStore(
      options,
      Effect.gen(function* () {
        // fails on a missing file, or on a run still running on it
        const file = yield* Files.use((files) => files.fileAt(path));
        const deleted = yield* ReviewRuns.use((runs) => runs.deleteRuns(file.id, options.version));
        yield* Console.log(`deleted ${deleted} ${pluralize(deleted, "run", "runs")}`);
      }).pipe(Effect.provideService(WorkspaceId, { wsId })),
    ),
  );
