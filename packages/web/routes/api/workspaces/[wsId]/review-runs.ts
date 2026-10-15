import { ReviewRuns, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";
import { define } from "#/define.ts";
import { reviewLoader } from "#/signals/review.server.ts";
import { runtime } from "#/store.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const { wsId } = ctx.state;
    const file = ctx.url.searchParams.get("file");
    if (!file?.trim()) {
      return Response.json({
        runs: await runtime.runPromise(
          Effect.provideService(
            Effect.gen(function* () {
              const runs = yield* ReviewRuns;
              return yield* runs.listRuns();
            }),
            WorkspaceId,
            { wsId },
          ),
        ),
      });
    }
    return Response.json(await reviewLoader({ wsId, path: file }));
  }),
};
