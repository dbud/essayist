import { Command } from "@cliffy/command";
import { Files, pluralize, ReviewRuns, WorkspaceId } from "@essayist/core";
import { Effect, Result } from "effect";

import { withStore } from "#/db.ts";
import type { DbctlGlobals } from "#/globals.ts";

export const wipeRuns = new Command<DbctlGlobals>()
  .description("Delete the review runs of a file, with their traces and marks.")
  .arguments("<wsId:string> <path:string>")
  .option("--version <versionId:string>", "Only the runs on this version.")
  .action(({ remote, version }, wsId: string, path: string) =>
    withStore({ remote }, async ({ runtime }) => {
      const deleted = await runtime.runPromise(
        Effect.gen(function* () {
          const file = yield* Files.use((files) => files.fileAt(path));
          return yield* ReviewRuns.use((runs) => runs.deleteRuns(file.id, version));
        }).pipe(Effect.provideService(WorkspaceId, { wsId }), Effect.result),
      );
      // a missing file, or a run still running on it
      if (Result.isFailure(deleted)) {
        console.error(deleted.failure.message);
        process.exitCode = 1;
        return;
      }
      console.log(`deleted ${deleted.success} ${pluralize(deleted.success, "run", "runs")}`);
    }),
  );
