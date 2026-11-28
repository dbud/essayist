import type { FileMissingError, Files, Marks, ReviewRuns } from "@essayist/core";
import { Effect } from "effect";

import { fileContentLoader } from "./fileContent.loader.ts";
import { fileVersionsLoader } from "./fileVersions.loader.ts";
import type { FileViewData } from "./fileView.data.ts";
import { latestReviewLoader } from "./latestReview.loader.ts";

export function fileViewLoader(
  wsId: string,
  fileId: string,
  versionId: string | null,
): Effect.Effect<typeof FileViewData.Type, FileMissingError, Files | Marks | ReviewRuns> {
  return Effect.gen(function* () {
    const content = yield* fileContentLoader(wsId, fileId, versionId ?? undefined);
    const versions = yield* fileVersionsLoader(wsId, fileId);
    const review = yield* latestReviewLoader(wsId, fileId, content.version.id);
    return { content, versions, review };
  });
}
