import { type FileMissingError, Files, type PersistenceError, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";

import type { FileVersionsData } from "./fileVersions.data.ts";

export function fileVersionsLoader(
  wsId: string,
  path: string,
): Effect.Effect<typeof FileVersionsData.Type, PersistenceError | FileMissingError, Files> {
  return Effect.provideService(
    Files.use((store) => store.getVersions(path)),
    WorkspaceId,
    { wsId },
  );
}
