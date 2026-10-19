import type { FileMissingError, Files, PersistenceError } from "@essayist/core";
import { Effect } from "effect";
import { fileContentLoader } from "./fileContent.loader.ts";
import type { FileContentsData } from "./fileContents.data.ts";

export function fileContentsLoader(
  wsId: string | null,
  path: string | null,
): Effect.Effect<FileContentsData, PersistenceError | FileMissingError, Files> {
  return Effect.gen(function* () {
    const content =
      wsId === null || path === null
        ? null
        : yield* fileContentLoader(wsId, path);
    return { wsId, path, content };
  });
}
