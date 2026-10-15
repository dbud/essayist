/**
 * Shared internals for the Files service: the version and chunk read tree
 * and the mark re-anchoring plan, bound to one persistence service.
 */

import { type Context, Effect } from "effect";
import { type ContentManifest, reassemble } from "#/files/chunked_content.ts";
import { resolveMarks } from "#/marks/resolver.ts";
import type { Mark } from "#/marks/types.ts";
import {
  ConcurrentModificationError,
  type Entry,
  type Key,
  type Persistence,
  type PersistenceError,
  type WriteOp,
} from "#/persistence/mod.ts";
import {
  contentChunkKey,
  contentManifestKey,
  fileVersionsKey,
  latestKey,
  marksKey,
  type StoredSnapshot,
} from "./keys.ts";
import type { FileSnapshot, FileVersion } from "./types.ts";

/** Max keys per getMany round trip; KV caps a single getMany at 10. */
const MAX_GET_MANY = 10;
/** Total attempts for an optimistic-concurrency retry (plus the first). */
const MAX_ATTEMPTS = 10;

/**
 * Retry an optimistic-concurrency attempt on a checked batch rejection: the
 * attempt re-runs until the guard matches. Mirrors the legacy class's
 * 10-attempt retry with no delay between attempts.
 */
export const retryConcurrency = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.retry(effect, {
    times: MAX_ATTEMPTS - 1,
    while: (error) => error instanceof ConcurrentModificationError,
  });

export function makeInternals(
  persistence: Context.Service.Shape<typeof Persistence>,
) {
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

  /** Reassemble content from a manifest, fetching extra chunks if needed. */
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
      const keys = Array.from({ length: manifest.chunkCount - 1 }, (_, i) =>
        contentChunkKey(wsId, path, versionId, i + 1),
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
      const oldContent = yield* getVersionContent(wsId, path, fromVersionId);
      const marks = resolveMarks({ marks: pending, oldContent, newContent });
      return {
        op: {
          type: "set",
          key: marksKey(wsId, path, targetVersionId),
          value: [...targetMarks, ...marks],
        },
        marks,
      };
    });

  return {
    getManyBatched,
    reassembleContent,
    getFile,
    getSnapshot,
    getVersion,
    getVersionContent,
    getMarksList,
    migrationOp,
  };
}

/** The bound internals object {@linkcode makeInternals} returns. */
export type Internals = ReturnType<typeof makeInternals>;
