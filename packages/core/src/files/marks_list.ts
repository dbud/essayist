/**
 * The marks-family surface of the Files service: mark-list storage bound to one persistence service
 * and the Files internals. Mark placement lives in the Marks service; a write migrates marks in the
 * same atomic batch as the version append, which is why the list storage lives on Files.
 */

import { type Context, Effect } from "effect";

import { type Internals, retryConcurrency } from "#/files/internals.ts";
import type { Mark, MigrateMarksResult } from "#/marks/types.ts";
import type {
  ConcurrentModificationError,
  Persistence,
  PersistenceError,
  WriteOp,
} from "#/persistence/mod.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { latestKey, marksKey, type StoredSnapshot } from "./keys.ts";
import type { FileMissingError } from "./types.ts";

export function makeMarkLists(
  persistence: Context.Service.Shape<typeof Persistence>,
  internals: Internals,
) {
  const getMarks = (
    path: string,
    versionId: string,
  ): Effect.Effect<Mark[], PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      return yield* internals.getMarksList(wsId, path, versionId);
    });

  /** Append one mark to its version's list, checked against the list. */
  const saveMark = (
    mark: Mark,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError, WorkspaceId> =>
    retryConcurrency(
      Effect.gen(function* () {
        const { wsId } = yield* WorkspaceId;
        const key = marksKey(wsId, mark.path, mark.version_id);
        const entry = yield* persistence.get<Mark[]>(key);
        const marks = entry?.value ?? [];
        yield* persistence.batch([{ type: "set", key, value: [...marks, mark] }], {
          checks: [{ key, versionstamp: entry?.versionstamp ?? null }],
        });
      }),
    );

  /** Remove the marks matching the predicate from a version's list; returns the removed count. */
  const deleteMarksWhere = (
    path: string,
    versionId: string,
    predicate: (mark: Mark) => boolean,
  ): Effect.Effect<number, PersistenceError | ConcurrentModificationError, WorkspaceId> =>
    retryConcurrency(
      Effect.gen(function* () {
        const { wsId } = yield* WorkspaceId;
        const key = marksKey(wsId, path, versionId);
        const entry = yield* persistence.get<Mark[]>(key);
        if (!entry) return 0;
        const kept = entry.value.filter((m) => !predicate(m));
        const removed = entry.value.length - kept.length;
        if (removed === 0) return 0;
        const op: WriteOp =
          kept.length === 0 ? { type: "delete", key } : { type: "set", key, value: kept };
        yield* persistence.batch([op], {
          checks: [{ key, versionstamp: entry.versionstamp }],
        });
        return removed;
      }),
    );

  const deleteMark = (
    path: string,
    versionId: string,
    markId: string,
  ): Effect.Effect<boolean, PersistenceError | ConcurrentModificationError, WorkspaceId> =>
    Effect.map(
      deleteMarksWhere(path, versionId, (m) => m.id === markId),
      (removed) => removed > 0,
    );

  const migrateMarks = (
    path: string,
    fromVersionId: string,
  ): Effect.Effect<
    MigrateMarksResult,
    PersistenceError | ConcurrentModificationError | FileMissingError,
    WorkspaceId
  > =>
    retryConcurrency(
      Effect.gen(function* () {
        const { wsId } = yield* WorkspaceId;
        const empty: MigrateMarksResult = { migrated: 0, stale: 0 };
        const latestEntry = yield* persistence.get<StoredSnapshot>(latestKey(wsId, path));
        if (!latestEntry) return empty;
        const targetVersionId = latestEntry.value.version_id;
        if (targetVersionId === fromVersionId) return empty;

        const targetKey = marksKey(wsId, path, targetVersionId);
        const targetEntry = yield* persistence.get<Mark[]>(targetKey);
        const targetMarks = targetEntry?.value ?? [];
        const targetContent = yield* internals.reassembleContent(wsId, path, targetVersionId, {
          chunkCount: latestEntry.value.chunkCount,
          firstChunk: latestEntry.value.firstChunk,
        });

        const resolved = yield* internals.migrationOp(
          wsId,
          path,
          fromVersionId,
          targetVersionId,
          targetMarks,
          targetContent,
        );
        if (!resolved) return empty;

        // Checking latestKey guards against a save landing mid-commit: on a versionstamp mismatch
        // the batch is rejected and the attempt re-runs against the new latest.
        yield* persistence.batch([resolved.op], {
          checks: [
            {
              key: latestKey(wsId, path),
              versionstamp: latestEntry.versionstamp,
            },
            {
              key: targetKey,
              versionstamp: targetEntry?.versionstamp ?? null,
            },
          ],
        });

        return {
          migrated: resolved.marks.length,
          stale: resolved.marks.filter((m) => m.status === "stale").length,
        };
      }),
    );

  return {
    getMarks,
    saveMark,
    deleteMark,
    deleteMarksWhere,
    migrateMarks,
  };
}
