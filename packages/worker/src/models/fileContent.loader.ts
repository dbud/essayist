import { type FileMissingError, Files, WorkspaceId } from "@essayist/core";
import { Effect, Option } from "effect";

import type { FileContentData } from "./fileContent.data.ts";

/** The latest version of a file unless one is given. */
export function fileContentLoader(
  wsId: string,
  path: string,
  versionId?: string,
): Effect.Effect<typeof FileContentData.Type, FileMissingError, Files> {
  return Effect.gen(function* () {
    const files = yield* Files;
    const file = yield* files.fileAt(path);
    const version = yield* files.read(file.id, versionId);
    const latest = (yield* files.versions(file.id)).at(-1);
    // a draft is always on the latest version
    const draft = latest?.id === version.id ? yield* files.readDraft(file.id) : Option.none();
    return { version, draft: Option.getOrNull(draft) };
  }).pipe(Effect.provideService(WorkspaceId, { wsId }));
}
