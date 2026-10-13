import { ReviewRuns, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";
import { registerLoader } from "@/signals/models.server.ts";
import type { ReviewKey } from "@/signals/review.ts";
import { type ReviewData, reviewNs } from "@/signals/review.ts";
import { runtime } from "@/store.ts";

export async function reviewLoader({
  wsId,
  path,
}: ReviewKey): Promise<ReviewData> {
  return {
    runs: await runtime.runPromise(
      Effect.provideService(
        Effect.gen(function* () {
          const runs = yield* ReviewRuns;
          return yield* runs.listRuns(path);
        }),
        WorkspaceId,
        { wsId },
      ),
    ),
  };
}

registerLoader(reviewNs, reviewLoader);
