/**
 * Versioned text files as an Effect service: latest reads, versioned writes
 * with in-batch mark migration, listing, history, and unified diffs. The
 * workspace scope comes from the WorkspaceId tag. The key layout lives in
 * keys.ts and the shared internals in internals.ts.
 */

import { sortBy } from "@std/collections";
import { Clock, Context, Effect, Layer } from "effect";
import { unifiedDiff } from "#/diff/unified_diff.ts";
import { type ContentManifest, chunkContent } from "#/files/chunked_content.ts";
import { Ids } from "#/ids.ts";
import type { Mark, MigrateMarksResult } from "#/marks/types.ts";
import {
  type ConcurrentModificationError,
  Persistence,
  type PersistenceError,
  type WriteOp,
} from "#/persistence/mod.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";
import { makeInternals, retryConcurrency } from "./internals.ts";
import {
  contentChunkKey,
  contentManifestKey,
  DRAFT_VERSION_ID,
  draftKey,
  fileVersionsKey,
  latestKey,
  latestPrefixKey,
  type StoredSnapshot,
} from "./keys.ts";
import { makeMarkLists } from "./marks_list.ts";
import {
  type DiffResult,
  type DraftSnapshot,
  type FileEntry,
  FileMissingError,
  type FileSnapshot,
  type FileVersion,
  type WriteResult,
} from "./types.ts";

export interface Interface {
  /**
   * Read file content: the latest version, or the pinned version when
   * given. A missing file or version fails with FileMissingError.
   */
  read(
    path: string,
    versionId?: string,
  ): Effect.Effect<
    FileSnapshot,
    PersistenceError | FileMissingError,
    WorkspaceId
  >;
  /**
   * Write new content as a new version. Snapshots the previous version and
   * migrates its marks into the new version in the same atomic batch,
   * guarded on the versions list. Clears any pending draft. Fails with
   * FileMissingError when the previous version's content is missing in
   * storage.
   */
  write(
    path: string,
    content: string,
  ): Effect.Effect<
    WriteResult,
    PersistenceError | ConcurrentModificationError | FileMissingError,
    WorkspaceId
  >;
  /** List files in the workspace, optionally filtered by path prefix. */
  list(
    prefix?: string,
  ): Effect.Effect<FileEntry[], PersistenceError, WorkspaceId>;
  /**
   * The versions of a file, oldest first. A missing file fails with
   * FileMissingError.
   */
  getVersions(
    path: string,
  ): Effect.Effect<
    FileVersion[],
    PersistenceError | FileMissingError,
    WorkspaceId
  >;
  /**
   * Write the mutable draft head. No version, no marks migration. A draft
   * sits on top of an existing version, so a missing file fails with
   * FileMissingError.
   */
  writeDraft(
    path: string,
    content: string,
  ): Effect.Effect<
    DraftSnapshot,
    PersistenceError | ConcurrentModificationError | FileMissingError,
    WorkspaceId
  >;
  /**
   * Read the draft, or null when no draft exists. With atVersionId, also
   * null when that version is not the latest: the draft belongs to the
   * latest version.
   */
  readDraft(
    path: string,
    atVersionId?: string,
  ): Effect.Effect<DraftSnapshot | null, PersistenceError, WorkspaceId>;
  /** Promote the draft to a version and clear it. */
  promoteDraft(
    path: string,
  ): Effect.Effect<
    WriteResult | null,
    PersistenceError | ConcurrentModificationError | FileMissingError,
    WorkspaceId
  >;
  /** Revert a file to a previous version as a new version. Fails with
   * FileMissingError when the previous version's content is missing in
   * storage. */
  revert(
    path: string,
    versionId: string,
  ): Effect.Effect<
    boolean,
    PersistenceError | ConcurrentModificationError | FileMissingError,
    WorkspaceId
  >;
  /** Unified diff between two versions of a file. A missing version fails
   * with FileMissingError. */
  diff(
    path: string,
    versionA: string,
    versionB: string,
  ): Effect.Effect<
    DiffResult,
    PersistenceError | FileMissingError,
    WorkspaceId
  >;
  /** Marks placed on a specific version of a file. */
  getMarks(
    path: string,
    versionId: string,
  ): Effect.Effect<Mark[], PersistenceError, WorkspaceId>;
  /** Append one mark to its version's list, checked against the list. */
  saveMark(
    mark: Mark,
  ): Effect.Effect<
    void,
    PersistenceError | ConcurrentModificationError,
    WorkspaceId
  >;
  /** Delete a mark by id from a version's list. False when absent. */
  deleteMark(
    path: string,
    versionId: string,
    markId: string,
  ): Effect.Effect<
    boolean,
    PersistenceError | ConcurrentModificationError,
    WorkspaceId
  >;
  /**
   * Re-anchor a version's marks onto the latest version. Marks whose
   * thread_id is already on the latest are skipped; text that no longer
   * resolves becomes stale. No-op when the given version is latest. Fails
   * with FileMissingError when the source version's content is missing in
   * storage.
   */
  migrateMarks(
    path: string,
    fromVersionId: string,
  ): Effect.Effect<
    MigrateMarksResult,
    PersistenceError | ConcurrentModificationError | FileMissingError,
    WorkspaceId
  >;
}

export class Files extends Context.Service<Files, Interface>()(
  "@essayist/core/files/Files",
) {
  /** Requires the {@linkcode Persistence} service; compose with
   * Persistence.layerKv at the composition root. The workspace scope comes
   * from the WorkspaceId tag at call time. */
  static readonly layerNoDeps: Layer.Layer<Files, never, Persistence> =
    Layer.effect(
      Files,
      Effect.gen(function* () {
        const persistence = yield* Persistence;
        const internals = makeInternals(persistence);
        const markLists = makeMarkLists(persistence, internals);

        const read = (
          path: string,
          versionId?: string,
        ): Effect.Effect<
          FileSnapshot,
          PersistenceError | FileMissingError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            return yield* internals.getSnapshot(wsId, path, versionId);
          });

        const write = (
          path: string,
          content: string,
        ): Effect.Effect<
          WriteResult,
          PersistenceError | ConcurrentModificationError | FileMissingError,
          WorkspaceId
        > =>
          retryConcurrency(
            Effect.gen(function* () {
              const { wsId } = yield* WorkspaceId;
              const ids = yield* Ids;
              const timestamp = yield* Clock.currentTimeMillis;
              const lines = content.split("\n").length;
              const versionId = ids.next();
              const version: FileVersion = {
                version_id: versionId,
                timestamp,
                lines,
              };
              const versionsKey = fileVersionsKey(wsId, path);
              const versionsEntry =
                yield* persistence.get<FileVersion[]>(versionsKey);
              const versions = versionsEntry?.value ?? [];
              const draftManifest = yield* persistence.get<ContentManifest>(
                contentManifestKey(wsId, path, DRAFT_VERSION_ID),
              );
              const previousVersionId =
                versions.length > 0
                  ? versions[versions.length - 1].version_id
                  : undefined;
              const { manifest, extraChunks } = chunkContent(content);

              // Write extra chunks individually before the metadata batch.
              // Deno KV caps total atomic mutation size at 800 KiB, so large
              // files can't fit all chunks in a single batch. Chunks are
              // keyed by versionId (unique per write), so if the metadata
              // batch below fails, these are harmless orphans -- never
              // referenced until the manifest commits.
              for (let i = 0; i < extraChunks.length; i++) {
                yield* persistence.set(
                  contentChunkKey(wsId, path, versionId, i + 1),
                  extraChunks[i],
                );
              }

              // Metadata batch: versions, manifest, latest, marks -- atomic
              // with an optimistic concurrency check on the versions list.
              const ops: WriteOp[] = [
                {
                  type: "set",
                  key: versionsKey,
                  value: [...versions, version],
                },
                {
                  type: "set",
                  key: contentManifestKey(wsId, path, versionId),
                  value: manifest,
                },
                {
                  type: "set",
                  key: latestKey(wsId, path),
                  value: { ...version, ...manifest },
                },
              ];

              // Migrate marks from the previous version into the new version.
              if (previousVersionId) {
                const migration = yield* internals.migrationOp(
                  wsId,
                  path,
                  previousVersionId,
                  versionId,
                  [],
                  content,
                );
                if (migration) ops.push(migration.op);
              }

              // A direct write supersedes any pending draft: clear it.
              if (draftManifest) {
                ops.push({ type: "delete", key: draftKey(wsId, path) });
                ops.push({
                  type: "delete",
                  key: contentManifestKey(wsId, path, DRAFT_VERSION_ID),
                });
                for (let i = 1; i < draftManifest.value.chunkCount; i++) {
                  ops.push({
                    type: "delete",
                    key: contentChunkKey(wsId, path, DRAFT_VERSION_ID, i),
                  });
                }
              }

              // Guard against a concurrent write to the same file: if the
              // versions list changed since we read it, the whole batch is
              // rejected and retried.
              yield* persistence.batch(ops, {
                checks: [
                  {
                    key: versionsKey,
                    versionstamp: versionsEntry?.versionstamp ?? null,
                  },
                ],
              });

              return {
                path,
                created: versions.length === 0,
                ...version,
              };
            }),
          );

        const list = (
          prefix?: string,
        ): Effect.Effect<FileEntry[], PersistenceError, WorkspaceId> =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const { entries } = yield* persistence.list<StoredSnapshot>(
              latestPrefixKey(wsId),
            );
            const result: FileEntry[] = [];
            for (const entry of entries) {
              const path = String(entry.key[entry.key.length - 1]);
              if (prefix !== undefined && !path.startsWith(prefix)) continue;
              const latest = entry.value;
              if (latest) {
                result.push({
                  path,
                  lines: latest.lines,
                  latestVersionId: latest.version_id,
                });
              }
            }
            result.sort((a, b) => a.path.localeCompare(b.path));
            return result;
          });

        const getVersions = (
          path: string,
        ): Effect.Effect<
          FileVersion[],
          PersistenceError | FileMissingError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const entry = yield* persistence.get<FileVersion[]>(
              fileVersionsKey(wsId, path),
            );
            const versions = entry?.value;
            if (!versions) {
              return yield* Effect.fail(
                new FileMissingError({ path, versionId: null }),
              );
            }
            return sortBy(versions, (version) => version.timestamp);
          });

        const writeDraft = (
          path: string,
          content: string,
        ): Effect.Effect<
          DraftSnapshot,
          PersistenceError | ConcurrentModificationError | FileMissingError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            // TODO -- allow drafts without versions?
            const latestEntry = yield* persistence.get<StoredSnapshot>(
              latestKey(wsId, path),
            );
            if (!latestEntry) {
              return yield* Effect.fail(
                new FileMissingError({ path, versionId: null }),
              );
            }
            const timestamp = yield* Clock.currentTimeMillis;
            const { manifest, extraChunks } = chunkContent(content);

            // Drop chunk keys left over from a larger previous draft.
            const previous = yield* persistence.get<ContentManifest>(
              contentManifestKey(wsId, path, DRAFT_VERSION_ID),
            );
            const ops: WriteOp[] = [];
            if (previous) {
              for (
                let i = extraChunks.length + 1;
                i < previous.value.chunkCount;
                i++
              ) {
                ops.push({
                  type: "delete",
                  key: contentChunkKey(wsId, path, DRAFT_VERSION_ID, i + 1),
                });
              }
            }
            ops.push({
              type: "set",
              key: contentManifestKey(wsId, path, DRAFT_VERSION_ID),
              value: manifest,
            });
            ops.push({
              type: "set",
              key: draftKey(wsId, path),
              value: { timestamp },
            });
            yield* persistence.batch(ops);
            return { content, timestamp };
          });

        const readDraft = (
          path: string,
          atVersionId?: string,
        ): Effect.Effect<DraftSnapshot | null, PersistenceError, WorkspaceId> =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            if (atVersionId !== undefined) {
              const latest = yield* persistence.get<StoredSnapshot>(
                latestKey(wsId, path),
              );
              if (latest?.value.version_id !== atVersionId) return null;
            }
            const meta = yield* persistence.get<{ timestamp: number }>(
              draftKey(wsId, path),
            );
            if (!meta) return null;
            const manifestEntry = yield* persistence.get<ContentManifest>(
              contentManifestKey(wsId, path, DRAFT_VERSION_ID),
            );
            if (!manifestEntry) return null;
            const content = yield* internals.reassembleContent(
              wsId,
              path,
              DRAFT_VERSION_ID,
              manifestEntry.value,
            );
            return { content, timestamp: meta.value.timestamp };
          });

        const promoteDraft = (
          path: string,
        ): Effect.Effect<
          WriteResult | null,
          PersistenceError | ConcurrentModificationError | FileMissingError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const manifestEntry = yield* persistence.get<ContentManifest>(
              contentManifestKey(wsId, path, DRAFT_VERSION_ID),
            );
            if (!manifestEntry) return null;
            const content = yield* internals.reassembleContent(
              wsId,
              path,
              DRAFT_VERSION_ID,
              manifestEntry.value,
            );
            return yield* write(path, content);
          });

        const revert = (
          path: string,
          versionId: string,
        ): Effect.Effect<
          boolean,
          PersistenceError | ConcurrentModificationError | FileMissingError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const content = yield* internals
              .getVersionContent(wsId, path, versionId)
              .pipe(
                Effect.catchTag("FileMissingError", () =>
                  Effect.succeed(undefined),
                ),
              );
            if (content === undefined) return false;
            yield* write(path, content);
            return true;
          });

        const diff = (
          path: string,
          versionA: string,
          versionB: string,
        ): Effect.Effect<
          DiffResult,
          PersistenceError | FileMissingError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const [contentA, contentB] = yield* Effect.all([
              internals.getVersionContent(wsId, path, versionA),
              internals.getVersionContent(wsId, path, versionB),
            ]);
            return {
              diff: unifiedDiff(contentA, contentB, versionA, versionB),
            };
          });

        return Files.of({
          read,
          write,
          list,
          getVersions,
          writeDraft,
          readDraft,
          promoteDraft,
          revert,
          diff,
          ...markLists,
        });
      }),
    );
}
