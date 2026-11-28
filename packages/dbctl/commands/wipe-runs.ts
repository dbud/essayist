import { Command } from "@cliffy/command";
import { Files, pluralize, ReviewRuns, WorkspaceId } from "@essayist/core";
import { Effect, Result } from "effect";

import type { KvctlGlobals } from "#/globals.ts";
import { withStore } from "#/kv.ts";

export const wipeRuns = new Command<KvctlGlobals>()
  .description("Delete the review runs of a file, with their traces and marks.")
  .arguments("<wsId:string> <path:string>")
  .option("--version <versionId:string>", "Only the runs on this version.")
  .action(({ local, version }, wsId: string, path: string) =>
    withStore({ local }, async ({ runtime }) => {
      const deleted = await runtime.runPromise(
        Effect.gen(function* () {
          const file = yield* Files.use((files) => files.fileAt(path));
          return yield* ReviewRuns.use((runs) => runs.deleteRuns(file.id, version));
        }).pipe(Effect.provideService(WorkspaceId, { wsId }), Effect.result),
      );
      // a missing file, or a run still running on it
      if (Result.isFailure(deleted)) {
        console.error(deleted.failure.message);
        process.exit(1);
      }
      console.log(`deleted ${deleted.success} ${pluralize(deleted.success, "run", "runs")}`);
    }),
  );
