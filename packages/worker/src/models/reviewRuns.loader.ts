import { type PersistenceError, ReviewRunList, ReviewRuns, WorkspaceId } from "@essayist/core";
import { Effect, Schema } from "effect";

import { type ReviewRunsData } from "./reviewRuns.data.ts";

export function reviewRunsLoader(
  wsId: string,
  path: string,
): Effect.Effect<ReviewRunsData, PersistenceError, ReviewRuns> {
  return Effect.provideService(
    ReviewRuns.use((store) => store.listRuns(path)).pipe(
      Effect.flatMap(Schema.encodeUnknownEffect(ReviewRunList)),
      Effect.catchTag("SchemaError", Effect.die),
    ),
    WorkspaceId,
    { wsId },
  );
}
