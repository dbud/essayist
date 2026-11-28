import { ReviewRuns, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";

import type { ReviewRunsData } from "./reviewRuns.data.ts";

/** The runs of a file, or of the whole workspace without a file, newest first. */
export function reviewRunsLoader(
  wsId: string,
  fileId?: string,
): Effect.Effect<typeof ReviewRunsData.Type, never, ReviewRuns> {
  return ReviewRuns.use((runs) => runs.listRuns(fileId)).pipe(
    Effect.provideService(WorkspaceId, { wsId }),
  );
}
