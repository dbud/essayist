/**
 * Versioned text files as an Effect service: latest reads, version history,
 * listing, and unified diffs. Writes, drafts, and the mark-list storage land
 * alongside in later commits. The workspace scope comes from the
 * WorkspaceId tag.
 *
 * Key layout (workspace-scoped):
 *   ["ws", wsId, "file:latest", path]                              -> StoredSnapshot
 *   ["ws", wsId, "file:versions", path]                            -> FileVersion[]
 *   ["ws", wsId, "file:content", path, version, "file:manifest"]   -> ContentManifest
 *   ["ws", wsId, "file:content", path, version, "file:chunk", i]   -> Uint8Array
 *   ["ws", wsId, "file:draft", path]                               -> { timestamp }
 *   ["ws", wsId, "marks", path, version]                           -> Mark[]
 */

import { sortBy } from "@std/collections";
import { Context, Effect, Layer } from "effect";
import { unifiedDiff } from "@/diff/unified_diff.ts";
import {
  type ContentManifest,
  chunkContent,
  reassemble,
} from "@/files/chunked_content.ts";
import { resolveMarks } from "@/marks/resolver.ts";
import {
  ConcurrentModificationError,
  type Entry,
  type Key,
  Persistence,
  type PersistenceError,
  type WriteOp,
} from "@/persistence/mod.ts";
import type { Mark } from "@/vfs/types.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";
import type {
  DiffResult,
  FileEntry,
  FileReadResult,
  FileSnapshot,
  FileVersion,
  ReadOptions,
  WriteResult,
} from "./types.ts";

type StoredSnapshot = FileVersion & ContentManifest;

const WORKSPACES = "ws";
const FILE_LATEST = "file:latest";
const FILE_VERSIONS = "file:versions";
const FILE_CONTENT = "file:content";
const FILE_MANIFEST = "file:manifest";
const FILE_CHUNK = "file:chunk";
const FILE_DRAFT = "file:draft";
const MARKS = "marks";

/** Reserved version id for the mutable draft head. Not in the versions list. */
const DRAFT_VERSION_ID = "draft";

/** Max keys per getMany round trip; KV caps a single getMany at 10. */
const MAX_GET_MANY = 10;
/** Total attempts for an optimistic-concurrency retry (plus the first). */
const MAX_ATTEMPTS = 10;

const latestKey = (wsId: string, path: string): Key => [
  WORKSPACES,
  wsId,
  FILE_LATEST,
  path,
];

const fileVersionsKey = (wsId: string, path: string): Key => [
  WORKSPACES,
  wsId,
  FILE_VERSIONS,
  path,
];

const contentManifestKey = (
  wsId: string,
  path: string,
  versionId: string,
): Key => [WORKSPACES, wsId, FILE_CONTENT, path, versionId, FILE_MANIFEST];

const contentChunkKey = (
  wsId: string,
  path: string,
  versionId: string,
  index: number,
): Key => [
  WORKSPACES,
  wsId,
  FILE_CONTENT,
  path,
  versionId,
  FILE_CHUNK,
  String(index),
];

const marksKey = (wsId: string, path: string, versionId: string): Key => [
  WORKSPACES,
  wsId,
  MARKS,
  path,
  versionId,
];

const draftKey = (wsId: string, path: string): Key => [
  WORKSPACES,
  wsId,
  FILE_DRAFT,
  path,
];

/**
 * Retry an optimistic-concurrency attempt on a checked batch rejection: the
 * attempt re-runs until the guard matches. Mirrors the legacy class's
 * 10-attempt retry with no delay between attempts.
 */
const retryConcurrency = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.retry(effect, {
    times: MAX_ATTEMPTS - 1,
    while: (error) => error instanceof ConcurrentModificationError,
  });

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
        let versionSeq = 0;

        /** Fetch many keys, batching around the getMany round-trip limit. */
        const getManyBatched = <T>(
          keys: Key[],
        ): Effect.Effect<(Entry<T> | undefined)[], PersistenceError> =>
          Effect.gen(function* () {
            const results: (Entry<T> | undefined)[] = [];
            for (let i = 0; i < keys.length; i += MAX_GET_MANY) {
              const batch = keys.slice(i, i + MAX_GET_MANY);
              const entries = yield* persistence.getMany<T>(batch);
              results.push(...entries);
            }
            return results;
          });

        /** Reassemble content from a manifest, fetching extra chunks. */
        const reassembleContent = (
          wsId: string,
          path: string,
          versionId: string,
          manifest: ContentManifest,
        ): Effect.Effect<string, PersistenceError> =>
          Effect.gen(function* () {
            if (manifest.chunkCount === 1) {
              return reassemble(manifest, []);
            }
            const keys = Array.from(
              { length: manifest.chunkCount - 1 },
              (_, i) => contentChunkKey(wsId, path, versionId, i + 1),
            );
            const entries = yield* getManyBatched<Uint8Array>(keys);
            const extraChunks: Uint8Array[] = [];
            for (const e of entries) {
              if (e) extraChunks.push(e.value);
            }
            return reassemble(manifest, extraChunks);
          });

        /** The latest version's snapshot, or undefined when the file is absent. */
        const getFile = (
          wsId: string,
          path: string,
        ): Effect.Effect<FileSnapshot | undefined, PersistenceError> =>
          Effect.gen(function* () {
            const entry = yield* persistence.get<StoredSnapshot>(
              latestKey(wsId, path),
            );
            if (!entry) return undefined;
            const { version_id, chunkCount, firstChunk, ...rest } = entry.value;
            const content = yield* reassembleContent(wsId, path, version_id, {
              chunkCount,
              firstChunk,
            });
            return { version_id, content, ...rest };
          });

        const getVersion = (
          wsId: string,
          path: string,
          versionId: string,
        ): Effect.Effect<FileVersion | undefined, PersistenceError> =>
          Effect.gen(function* () {
            const entry = yield* persistence.get<FileVersion[]>(
              fileVersionsKey(wsId, path),
            );
            return entry?.value.find((v) => v.version_id === versionId);
          });

        const getVersionContent = (
          wsId: string,
          path: string,
          versionId: string,
        ): Effect.Effect<string, PersistenceError> =>
          Effect.gen(function* () {
            const manifestEntry = yield* persistence.get<ContentManifest>(
              contentManifestKey(wsId, path, versionId),
            );
            if (!manifestEntry) return "";
            return yield* reassembleContent(
              wsId,
              path,
              versionId,
              manifestEntry.value,
            );
          });

        const getMarksList = (
          wsId: string,
          path: string,
          versionId: string,
        ): Effect.Effect<Mark[], PersistenceError> =>
          Effect.gen(function* () {
            const entry = yield* persistence.get<Mark[]>(
              marksKey(wsId, path, versionId),
            );
            return entry?.value ?? [];
          });

        /** Snapshot of the given version, or the latest when none is given. */
        const getSnapshot = (
          wsId: string,
          path: string,
          versionId?: string,
        ): Effect.Effect<FileSnapshot | undefined, PersistenceError> =>
          Effect.gen(function* () {
            if (!versionId) return yield* getFile(wsId, path);
            const [version, content] = yield* Effect.all([
              getVersion(wsId, path, versionId),
              getVersionContent(wsId, path, versionId),
            ]);
            if (!version) return undefined;
            return { ...version, content };
          });

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
              ...(yield* getSnapshot(wsId, path, versionId)),
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
                const migration = yield* migrationOp(
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

        /**
         * Set-op giving targetVersionId's marks plus fromVersionId's marks
         * re-anchored onto newContent; undefined when nothing is pending.
         * fromVersionId marks whose thread_id is already on the target are
         * skipped.
         */
        const migrationOp = (
          wsId: string,
          path: string,
          fromVersionId: string,
          targetVersionId: string,
          targetMarks: Mark[],
          newContent: string,
        ): Effect.Effect<
          { op: WriteOp; marks: Mark[] } | undefined,
          PersistenceError
        > =>
          Effect.gen(function* () {
            const fromMarks = yield* getMarksList(wsId, path, fromVersionId);
            const existing = new Set(targetMarks.map((m) => m.thread_id));
            const pending = fromMarks.filter((m) => !existing.has(m.thread_id));
            if (pending.length === 0) return undefined;
            const oldContent = yield* getVersionContent(
              wsId,
              path,
              fromVersionId,
            );
            const marks = resolveMarks({
              marks: pending,
              oldContent,
              newContent,
            });
            return {
              op: {
                type: "set",
                key: marksKey(wsId, path, targetVersionId),
                value: [...targetMarks, ...marks],
              },
              marks,
            };
          });

        const list = (
          prefix?: string,
        ): Effect.Effect<FileEntry[], PersistenceError, WorkspaceId> =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const { entries } = yield* persistence.list<StoredSnapshot>([
              WORKSPACES,
              wsId,
              FILE_LATEST,
            ]);
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
              getVersionContent(wsId, path, versionA),
              getVersionContent(wsId, path, versionB),
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
