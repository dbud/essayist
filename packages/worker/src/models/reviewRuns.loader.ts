import { type PersistenceError, ReviewRuns, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";

import type { ReviewRunsData } from "./reviewRuns.data.ts";

export function reviewRunsLoader(
  wsId: string,
  path: string,
): Effect.Effect<ReviewRunsData, PersistenceError, ReviewRuns> {
  return Effect.provideService(
    ReviewRuns.use((store) => store.listRuns(path)),
    WorkspaceId,
    { wsId },
  );
}
