/**
 * Versioned text files as an Effect service: latest reads, versioned writes
 * with in-batch mark migration, listing, history, and unified diffs. The
 * workspace scope comes from the WorkspaceId tag. The key layout lives in
 * keys.ts and the shared internals in internals.ts.
 */

import { sortBy } from "@std/collections";
import { Context, Effect, Layer } from "effect";
import { unifiedDiff } from "@/diff/unified_diff.ts";
import { type ContentManifest, chunkContent } from "@/files/chunked_content.ts";
import {
  type ConcurrentModificationError,
  Persistence,
  type PersistenceError,
  type WriteOp,
} from "@/persistence/mod.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";
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
import type {
  DiffResult,
  FileEntry,
  FileReadResult,
  FileSnapshot,
  FileVersion,
  ReadOptions,
  WriteResult,
} from "./types.ts";

export interface Interface {
  /**
   * Read file content. By default reads the latest version. Missing files
   * and versions return an empty snapshot with version_id "" (reads never
   * throw by design, parity with the legacy tool contract).
   */
  read(
    path: string,
    options?: ReadOptions,
  ): Effect.Effect<FileReadResult, PersistenceError, WorkspaceId>;
  /**
   * Write new content as a new version. Snapshots the previous version and
   * migrates its marks into the new version in the same atomic batch,
   * guarded on the versions list. Clears any pending draft.
   */
  write(
    path: string,
    content: string,
  ): Effect.Effect<
    WriteResult,
    PersistenceError | ConcurrentModificationError,
    WorkspaceId
  >;
  /** List files in the workspace, optionally filtered by path prefix. */
  list(
    prefix?: string,
  ): Effect.Effect<FileEntry[], PersistenceError, WorkspaceId>;
  /** Version history of a file, oldest first. */
  getHistory(
    path: string,
  ): Effect.Effect<FileVersion[], PersistenceError, WorkspaceId>;
  /** Unified diff between two versions of a file. */
  diff(
    path: string,
    versionA: string,
    versionB: string,
  ): Effect.Effect<DiffResult, PersistenceError, WorkspaceId>;
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
        let versionSeq = 0;

        const read = (
          path: string,
          { versionId, startLine, endLine, numbered }: ReadOptions = {},
        ): Effect.Effect<FileReadResult, PersistenceError, WorkspaceId> =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const snapshot: FileSnapshot = {
              // version_id "" marks a miss; read never throws by design.
              content: "",
              version_id: "",
              timestamp: 0,
              lines: 0,
              ...(yield* internals.getSnapshot(wsId, path, versionId)),
            };
            const start = Math.max(1, startLine ?? 1);
            const end = Math.min(snapshot.lines, endLine ?? snapshot.lines);
            let selectedLines = snapshot.content
              .split("\n")
              .slice(start - 1, end);
            if (numbered) {
              selectedLines = selectedLines.map(
                (line, i) => `${String(start + i).padStart(6)}: ${line}`,
              );
            }
            return {
              ...snapshot,
              content: selectedLines.join("\n"),
              start_line: start,
              end_line: end,
            };
          });

        const write = (
          path: string,
          content: string,
        ): Effect.Effect<
          WriteResult,
          PersistenceError | ConcurrentModificationError,
          WorkspaceId
        > =>
          retryConcurrency(
            Effect.gen(function* () {
              const { wsId } = yield* WorkspaceId;
              const timestamp = Date.now();
              const lines = content.split("\n").length;
              const versionId = `${timestamp}_${++versionSeq}`;
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
              if (latest) result.push({ path, lines: latest.lines });
            }
            result.sort((a, b) => a.path.localeCompare(b.path));
            return result;
          });

        const getHistory = (
          path: string,
        ): Effect.Effect<FileVersion[], PersistenceError, WorkspaceId> =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const entry = yield* persistence.get<FileVersion[]>(
              fileVersionsKey(wsId, path),
            );
            return sortBy(entry?.value ?? [], (version) => version.timestamp);
          });

        const diff = (
          path: string,
          versionA: string,
          versionB: string,
        ): Effect.Effect<DiffResult, PersistenceError, WorkspaceId> =>
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
          getHistory,
          diff,
        });
      }),
    );
}
