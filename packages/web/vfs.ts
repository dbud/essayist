/**
 * The workspace files bridge: a promise-shaped {@link VFS} over the files,
 * marks, and search services, so promise consumers (signals, tools, the
 * review runner) keep working until their own migration. Each call runs
 * through the shared runtime with the workspace scope set.
 */

import { Files, Marks, Search, type VFS, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";
import type { Runtime } from "@/store.ts";

/** Build the bridge for one workspace scope. */
export function vfsFor(runtime: Runtime, wsId: string): VFS {
  const run = <A, E>(
    effect: Effect.Effect<A, E, Files | Marks | Search | WorkspaceId>,
  ): Promise<A> =>
    runtime.runPromise(Effect.provideService(effect, WorkspaceId, { wsId }));

  return {
    read: (path, options) =>
      run(Files.use((files) => files.read(path, options))),
    write: (path, content) =>
      run(Files.use((files) => files.write(path, content))),
    list: (prefix) => run(Files.use((files) => files.list(prefix))),
    getHistory: (path) => run(Files.use((files) => files.getHistory(path))),
    writeDraft: (path, content) =>
      run(Files.use((files) => files.writeDraft(path, content))),
    readDraft: (path) => run(Files.use((files) => files.readDraft(path))),
    promoteDraft: (path) => run(Files.use((files) => files.promoteDraft(path))),
    revert: (path, versionId) =>
      run(Files.use((files) => files.revert(path, versionId))),
    diff: (path, versionA, versionB) =>
      run(Files.use((files) => files.diff(path, versionA, versionB))),
    mark: (path, selectedText, comment, options) =>
      run(
        Marks.use((marks) => marks.mark(path, selectedText, comment, options)),
      ),
    getMarks: (path, versionId) =>
      run(Files.use((files) => files.getMarks(path, versionId))),
    deleteMark: (path, versionId, markId) =>
      run(Files.use((files) => files.deleteMark(path, versionId, markId))),
    migrateMarks: (path, fromVersionId) =>
      run(Files.use((files) => files.migrateMarks(path, fromVersionId))),
    grep: (pattern, options) =>
      run(Search.use((search) => search.grep(pattern, options))),
    search: (text, options) =>
      run(Search.use((search) => search.search(text, options))),
  };
}
