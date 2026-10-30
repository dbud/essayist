import type { Files, PersistenceError, UserState } from "@essayist/core";
import { Effect } from "effect";

import { fileTreeLoader } from "./fileTree.loader.ts";
import type { FileTreesData } from "./fileTrees.data.ts";

export function fileTreesLoader(
  userId: string,
  wsId: string | null,
  pathIntent: string | undefined,
  versionIntent: string | undefined,
): Effect.Effect<FileTreesData, PersistenceError, Files | UserState> {
  return Effect.gen(function* () {
    const tree =
      wsId === null ? null : yield* fileTreeLoader(userId, wsId, pathIntent, versionIntent);
    return { wsId, tree };
  });
}
