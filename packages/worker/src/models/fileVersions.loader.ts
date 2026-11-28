import { type FileMissingError, Files, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";

import type { FileVersionsData } from "./fileVersions.data.ts";

export function fileVersionsLoader(
  wsId: string,
  fileId: string,
): Effect.Effect<typeof FileVersionsData.Type, FileMissingError, Files> {
  return Files.use((files) => files.versions(fileId)).pipe(
    Effect.provideService(WorkspaceId, { wsId }),
  );
}
