import type { Files, UserState } from "@essayist/core";
import { Effect } from "effect";

import { fileTreeLoader } from "./fileTree.loader.ts";
import type { FileTreesData } from "./fileTrees.data.ts";

export function fileTreesLoader(
  userId: string,
  wsId: string | null,
  pathIntent: string | undefined,
  seqIntent: number | undefined,
): Effect.Effect<typeof FileTreesData.Type, never, Files | UserState> {
  return Effect.gen(function* () {
    const tree = wsId === null ? null : yield* fileTreeLoader(userId, wsId, pathIntent, seqIntent);
    return { wsId, tree };
  });
}
