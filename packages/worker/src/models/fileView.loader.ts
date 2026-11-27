import type { FileMissingError, Files } from "@essayist/core";
import { Effect } from "effect";

import { fileContentLoader } from "./fileContent.loader.ts";
import { fileVersionsLoader } from "./fileVersions.loader.ts";
import type { FileViewData } from "./fileView.data.ts";

export function fileViewLoader(
  wsId: string,
  path: string,
  versionId: string | null,
): Effect.Effect<typeof FileViewData.Type, FileMissingError, Files> {
  return Effect.gen(function* () {
    const content = yield* fileContentLoader(wsId, path, versionId ?? undefined);
    const versions = yield* fileVersionsLoader(wsId, path);
    return { content, versions };
  });
}
