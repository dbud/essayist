import { Command } from "@cliffy/command";
import { type ReviewRun, ReviewRuns, WorkspaceId, pluralize } from "@essayist/core";
import { Effect, Option } from "effect";

import type { KvctlGlobals } from "#/globals.ts";
import { withStore } from "#/kv.ts";
import { pprint } from "#/utils/pprint.ts";

export const runs = new Command<KvctlGlobals>()
  .description("List review runs for a workspace, newest first.")
  .arguments("<wsId:string>")
  .option("--path <path:string>", "Filter by file path.")
  .action(({ local, path }, wsId: string) =>
    withStore({ local }, async ({ runtime }) => {
      const list = await runtime.runPromise(
        Effect.provideService(
          Effect.gen(function* () {
            const store = yield* ReviewRuns;
            return yield* store.listRuns(path);
          }),
          WorkspaceId,
          { wsId },
        ),
      );
      for (const run of list) {
        pprint(summariseRun(run));
      }
      // footer goes to stderr so piped stdout stays pure JSON
      console.error(`(${list.length} ${pluralize(list.length, "run", "runs")})`);
    }),
  );

function summariseRun({
  id,
  path,
  status,
  versionId,
  startedAt,
  completedAt,
  summary,
  error,
  leaseOwner,
  heartbeatAt,
}: ReviewRun): [string, unknown] {
  return [
    id,
    {
      status,
      path,
      versionId,
      startedAt,
      completedAt: Option.getOrUndefined(completedAt),
      summary: Option.getOrUndefined(summary),
      error: Option.getOrUndefined(error),
      ...(Option.isNone(leaseOwner)
        ? {}
        : { lease: `${Option.getOrUndefined(leaseOwner)}@${Option.getOrUndefined(heartbeatAt)}` }),
    },
  ];
}
