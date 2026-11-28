import { type FileMissingError, Files, WorkspaceId } from "@essayist/core";
import { Effect, Option } from "effect";

import type { FileContentData } from "./fileContent.data.ts";

/** The latest version of a file unless one is given. */
export function fileContentLoader(
  wsId: string,
  fileId: string,
  versionId?: string,
): Effect.Effect<typeof FileContentData.Type, FileMissingError, Files> {
  return Effect.gen(function* () {
    const files = yield* Files;
    const version = yield* files.read(fileId, versionId);
    const latest = (yield* files.versions(fileId)).at(-1);
    // a draft is always on the latest version
    const draft = latest?.id === version.id ? yield* files.readDraft(fileId) : Option.none();
    return { version, draft: Option.getOrNull(draft) };
  }).pipe(Effect.provideService(WorkspaceId, { wsId }));
}
