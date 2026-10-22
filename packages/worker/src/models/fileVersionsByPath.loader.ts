import type { FileMissingError, Files, PersistenceError } from "@essayist/core";
import { Effect } from "effect";
import { fileVersionsLoader } from "./fileVersions.loader.ts";
import type { FileVersionsByPathData } from "./fileVersionsByPath.data.ts";

export function fileVersionsByPathLoader(
  wsId: string | null,
  path: string | null,
): Effect.Effect<
  FileVersionsByPathData,
  PersistenceError | FileMissingError,
  Files
> {
  return Effect.gen(function* () {
    const versions =
      wsId === null || path === null
        ? null
        : yield* fileVersionsLoader(wsId, path);
    return { wsId, path, versions };
  });
}
