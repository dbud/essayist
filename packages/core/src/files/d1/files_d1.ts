/**
 * The Files D1 layer over the files, file_versions, file_drafts and marks tables.
 *
 * A write reads the latest version and its marks, then adds version seq + 1 with the marks moved
 * onto it. Its batch opens with a guard that fails, rolling back the whole batch, when another
 * write moved the latest version or changed its marks; the write then runs again.
 */

import type * as D1Client from "@effect/sql-d1/D1Client";
import { Array, Data, DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { Ids } from "#/idsRef.ts";
import { resolveMarks } from "#/marks/resolver.ts";
import { PersistenceError } from "#/persistence/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { Files } from "./service.ts";
import {
  File,
  FileDraft,
  FileExistsError,
  FileMissingError,
  FileSnapshot,
  FileTooLargeError,
  FileVersion,
  Mark,
  MAX_DOCUMENT_BYTES,
} from "./types.ts";

const backendFault = (cause: unknown) => new PersistenceError({ cause });

// D1 binds at most this many parameters in a statement.
const MAX_PARAMS = 100;

const MAX_ATTEMPTS = 10;

/** Another write moved the latest version, or changed its marks, while an attempt ran. */
class LatestMoved extends Data.TaggedError("LatestMoved") {}

/** The latest version of a file and the count of its marks; `seq` is null without versions. */
const LatestState = Schema.Struct({ seq: Schema.NullOr(Schema.Int), marks: Schema.Int });
type LatestState = typeof LatestState.Type;

const checkSize = (content: string) => {
  const bytes = new TextEncoder().encode(content).length;
  return bytes > MAX_DOCUMENT_BYTES ? Effect.fail(new FileTooLargeError({ bytes })) : Effect.void;
};

export function layerFilesD1(client: D1Client.D1Client): Layer.Layer<Files> {
  const findFile = SqlSchema.findOneOption({
    Request: Schema.Struct({ wsId: Schema.String, id: Schema.String }),
    Result: File,
    execute: ({ wsId, id }) =>
      client`SELECT * FROM files WHERE id = ${id} AND wsId = ${wsId} AND deletedAt IS NULL`,
  });

  // the version of a file in the workspace that is not deleted
  const findVersionInWorkspace = SqlSchema.findOneOption({
    Request: Schema.Struct({ wsId: Schema.String, id: Schema.String }),
    Result: FileVersion,
    execute: ({ wsId, id }) =>
      client`SELECT v.id, v.fileId, v.seq, v.createdAt
        FROM file_versions v JOIN files f ON f.id = v.fileId
        WHERE v.id = ${id} AND f.wsId = ${wsId} AND f.deletedAt IS NULL`,
  });

  const findFileByPath = SqlSchema.findOneOption({
    Request: Schema.Struct({ wsId: Schema.String, path: Schema.String }),
    Result: File,
    execute: ({ wsId, path }) =>
      client`SELECT * FROM files WHERE wsId = ${wsId} AND path = ${path} AND deletedAt IS NULL`,
  });

  const decodeFiles = Schema.decodeUnknownEffect(Schema.Array(File));
  const decodeVersions = Schema.decodeUnknownEffect(Schema.Array(FileVersion));

  const findLatest = SqlSchema.findOneOption({
    Request: Schema.Struct({ fileId: Schema.String }),
    Result: FileSnapshot,
    execute: ({ fileId }) =>
      client`SELECT * FROM file_versions WHERE fileId = ${fileId} ORDER BY seq DESC LIMIT 1`,
  });

  const latestSeqOf = (fileId: string) =>
    client`(SELECT max(seq) FROM file_versions WHERE fileId = ${fileId})`;
  const latestMarkCountOf = (fileId: string) =>
    client`(SELECT count(*) FROM marks m JOIN file_versions v ON v.id = m.versionId
      WHERE v.fileId = ${fileId} AND v.seq = ${latestSeqOf(fileId)})`;

  const findLatestState = SqlSchema.findOne({
    Request: Schema.Struct({ fileId: Schema.String }),
    Result: LatestState,
    execute: ({ fileId }) =>
      client`SELECT ${latestSeqOf(fileId)} AS seq, ${latestMarkCountOf(fileId)} AS marks`,
  });

  // fails on purpose, rolling back the batch, when the latest version or its marks changed
  const guardLatest = (fileId: string, state: LatestState) =>
    client`INSERT INTO file_versions (id) SELECT NULL
      WHERE ${latestSeqOf(fileId)} IS NOT ${state.seq}
        OR ${latestMarkCountOf(fileId)} IS NOT ${state.marks}`;

  const findVersion = SqlSchema.findOneOption({
    Request: Schema.Struct({ fileId: Schema.String, id: Schema.String }),
    Result: FileSnapshot,
    execute: ({ fileId, id }) =>
      client`SELECT * FROM file_versions WHERE id = ${id} AND fileId = ${fileId}`,
  });

  const findVersions = SqlSchema.findAll({
    Request: Schema.Struct({ fileId: Schema.String }),
    Result: FileVersion,
    execute: ({ fileId }) =>
      client`SELECT id, fileId, seq, createdAt FROM file_versions
        WHERE fileId = ${fileId} ORDER BY seq`,
  });

  const upsertDraft = SqlSchema.findOne({
    Request: FileDraft,
    Result: FileDraft,
    execute: (row) =>
      client`INSERT INTO file_drafts ${client.insert([row])}
        ON CONFLICT (fileId) DO UPDATE SET
          baseVersionId = excluded.baseVersionId,
          content = excluded.content,
          updatedAt = excluded.updatedAt
        RETURNING *`,
  });

  // a draft written on an older version reads as none
  const findDraft = SqlSchema.findOneOption({
    Request: Schema.Struct({ fileId: Schema.String }),
    Result: FileDraft,
    execute: ({ fileId }) =>
      client`SELECT d.* FROM file_drafts d
        WHERE d.fileId = ${fileId} AND d.baseVersionId = (
          SELECT id FROM file_versions WHERE fileId = d.fileId ORDER BY seq DESC LIMIT 1
        )`,
  });

  const findMarks = SqlSchema.findAll({
    Request: Schema.Struct({ versionId: Schema.String }),
    Result: Mark,
    execute: ({ versionId }) =>
      client`SELECT * FROM marks WHERE versionId = ${versionId} ORDER BY createdAt, id`,
  });

  const findMarksInWorkspace = SqlSchema.findAll({
    Request: Schema.Struct({ wsId: Schema.String, versionId: Schema.String }),
    Result: Mark,
    execute: ({ wsId, versionId }) =>
      client`SELECT m.* FROM marks m
        JOIN file_versions v ON v.id = m.versionId JOIN files f ON f.id = v.fileId
        WHERE m.versionId = ${versionId} AND f.wsId = ${wsId} AND f.deletedAt IS NULL
        ORDER BY m.createdAt, m.id`,
  });

  const insertMark = SqlSchema.void({
    Request: Mark,
    execute: (row) => client`INSERT INTO marks ${client.insert([row])}`,
  });

  const encodeVersion = (version: FileVersion, content: string) =>
    Schema.encodeEffect(FileVersion)(version).pipe(Effect.map((row) => ({ ...row, content })));

  /** Insert statements for marks, split to stay within the bound parameter limit. */
  const markInserts = (marks: readonly Mark[]) =>
    Effect.gen(function* () {
      const rows = yield* Effect.forEach(marks, (mark) => Schema.encodeEffect(Mark)(mark));
      if (!Array.isArrayNonEmpty(rows)) return [];
      const perStatement = Math.floor(MAX_PARAMS / Object.keys(rows[0]).length);
      return Array.chunksOf(rows, perStatement).map(
        (chunk) => client`INSERT INTO marks ${client.insert(chunk)}`,
      );
    });

  /** New copies of marks for a version, anchored again from the old content onto the new. */
  const migrateMarksOnto = (
    marks: readonly Mark[],
    versionId: string,
    oldContent: string,
    newContent: string,
  ) =>
    Effect.gen(function* () {
      const ids = yield* Ids;
      return resolveMarks({ marks, oldContent, newContent }, { newId: () => ids.next() }).map(
        // oxlint-disable-next-line typescript/no-misused-spread -- the resolver returns copies
        (resolved) => new Mark({ ...resolved, versionId }),
      );
    });

  // a deleted file keeps its rows, so every operation by id checks the file first
  const requireFile = (fileId: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const file = yield* Effect.mapError(findFile({ wsId, id: fileId }), backendFault);
      if (Option.isNone(file)) return yield* Effect.fail(new FileMissingError({ fileId }));
      return file.value;
    });

  // a file always has a version, so none means the file is missing
  const latestSnapshot = (fileId: string) =>
    findLatest({ fileId }).pipe(
      Effect.mapError(backendFault),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new FileMissingError({ fileId })),
          onSome: Effect.succeed,
        }),
      ),
    );

  /** A failed batch is a conflict when the latest state changed since it was read. */
  const conflictOr = (
    cause: unknown,
    fileId: string,
    state: LatestState,
  ): Effect.Effect<never, LatestMoved | PersistenceError> =>
    Effect.gen(function* () {
      const now = yield* Effect.mapError(findLatestState({ fileId }), backendFault);
      if (now.seq !== state.seq || now.marks !== state.marks) {
        return yield* Effect.fail(new LatestMoved());
      }
      return yield* Effect.fail(backendFault(cause));
    });

  const retryWhileMoved = <A, E, R>(attempt: Effect.Effect<A, E | LatestMoved, R>) =>
    attempt.pipe(
      Effect.retry({ times: MAX_ATTEMPTS - 1, while: (e) => e instanceof LatestMoved }),
      Effect.catchTag("LatestMoved", (e) => Effect.fail(backendFault(e))),
    );

  const list = (prefix?: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const under = prefix ?? null;
      // a single batch reads both at once, so every listed file has its latest version
      const [fileRows, versionRows] = yield* Effect.mapError(
        client.batch([
          client`SELECT * FROM files
            WHERE wsId = ${wsId} AND deletedAt IS NULL
              AND (${under} IS NULL OR substr(path, 1, length(${under})) = ${under})
            ORDER BY path`,
          client`SELECT v.id, v.fileId, v.seq, v.createdAt
            FROM file_versions v JOIN files f ON f.id = v.fileId
            WHERE f.wsId = ${wsId} AND f.deletedAt IS NULL
              AND (${under} IS NULL OR substr(f.path, 1, length(${under})) = ${under})
              AND v.seq = (SELECT max(seq) FROM file_versions WHERE fileId = f.id)`,
        ]),
        backendFault,
      );
      const listed = yield* Effect.mapError(decodeFiles(fileRows), backendFault);
      const latest = yield* Effect.mapError(decodeVersions(versionRows), backendFault);
      const latestByFile = new Map(latest.map((version) => [version.fileId, version]));
      return listed.flatMap((file) => {
        const version = latestByFile.get(file.id);
        return version === undefined ? [] : [{ file, latest: version }];
      });
    });

  const resolve = (path: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const file = yield* Effect.mapError(findFileByPath({ wsId, path }), backendFault);
      if (Option.isNone(file)) return yield* Effect.fail(new FileMissingError({ path }));
      return file.value;
    });

  const create = (path: string, content: string) =>
    Effect.gen(function* () {
      yield* checkSize(content);
      const { wsId } = yield* WorkspaceId;
      const ids = yield* Ids;
      const createdAt = yield* DateTime.now;
      const file = new File({
        id: ids.next(),
        wsId,
        path,
        createdAt,
        deletedAt: Option.none(),
        deletedBy: Option.none(),
      });
      const version = new FileVersion({ id: ids.next(), fileId: file.id, seq: 1, createdAt });
      const fileRow = yield* Effect.mapError(Schema.encodeEffect(File)(file), backendFault);
      const versionRow = yield* Effect.mapError(encodeVersion(version, content), backendFault);
      yield* client
        .batch([
          client`INSERT INTO files ${client.insert([fileRow])}`,
          client`INSERT INTO file_versions ${client.insert([versionRow])}`,
        ])
        .pipe(
          // another file holds the path, or the backend failed
          Effect.catch((cause): Effect.Effect<never, FileExistsError | PersistenceError> =>
            Effect.gen(function* () {
              const taken = yield* Effect.mapError(findFileByPath({ wsId, path }), backendFault);
              if (Option.isSome(taken)) return yield* Effect.fail(new FileExistsError({ path }));
              return yield* Effect.fail(backendFault(cause));
            }),
          ),
        );
      return { file, version };
    });

  const read = (fileId: string, versionId?: string) =>
    Effect.gen(function* () {
      yield* requireFile(fileId);
      if (versionId === undefined) return yield* latestSnapshot(fileId);
      const row = yield* Effect.mapError(findVersion({ fileId, id: versionId }), backendFault);
      if (Option.isNone(row))
        return yield* Effect.fail(new FileMissingError({ fileId, versionId }));
      return row.value;
    });

  const versions = (fileId: string) =>
    Effect.gen(function* () {
      yield* requireFile(fileId);
      const rows = yield* Effect.mapError(findVersions({ fileId }), backendFault);
      return [...rows];
    });

  /** Save a version; with `draft`, only while the draft is on the latest version. */
  const writeAttempt = (fileId: string, content: string, draft?: FileDraft) =>
    Effect.gen(function* () {
      const state = yield* Effect.mapError(findLatestState({ fileId }), backendFault);
      const latest = yield* latestSnapshot(fileId);
      if (latest.seq !== state.seq) return yield* Effect.fail(new LatestMoved());
      if (draft !== undefined && draft.baseVersionId !== latest.id) {
        return yield* Effect.fail(new LatestMoved());
      }
      const ids = yield* Ids;
      const version = new FileVersion({
        id: ids.next(),
        fileId,
        seq: latest.seq + 1,
        createdAt: yield* DateTime.now,
      });
      const previousMarks = yield* Effect.mapError(
        findMarks({ versionId: latest.id }),
        backendFault,
      );
      const marks = yield* migrateMarksOnto(previousMarks, version.id, latest.content, content);
      const versionRow = yield* Effect.mapError(encodeVersion(version, content), backendFault);
      const inserts = yield* Effect.mapError(markInserts(marks), backendFault);
      // promoting clears only the draft it read; a newer one stays
      const clearDraft =
        draft === undefined
          ? client`DELETE FROM file_drafts WHERE fileId = ${fileId}`
          : client`DELETE FROM file_drafts
              WHERE fileId = ${fileId} AND updatedAt = ${DateTime.formatIso(draft.updatedAt)}`;
      yield* client
        .batch([
          guardLatest(fileId, state),
          client`INSERT INTO file_versions ${client.insert([versionRow])}`,
          ...inserts,
          clearDraft,
        ])
        .pipe(Effect.catch((cause) => conflictOr(cause, fileId, state)));
      return version;
    });

  const write = (fileId: string, content: string) =>
    Effect.gen(function* () {
      yield* checkSize(content);
      yield* requireFile(fileId);
      return yield* retryWhileMoved(writeAttempt(fileId, content));
    });

  const writeDraft = (fileId: string, content: string) =>
    Effect.gen(function* () {
      yield* checkSize(content);
      yield* requireFile(fileId);
      const latest = yield* latestSnapshot(fileId);
      const draft = new FileDraft({
        fileId,
        baseVersionId: latest.id,
        content,
        updatedAt: yield* DateTime.now,
      });
      return yield* Effect.mapError(upsertDraft(draft), backendFault);
    });

  const readDraft = (fileId: string) =>
    Effect.gen(function* () {
      yield* requireFile(fileId);
      return yield* Effect.mapError(findDraft({ fileId }), backendFault);
    });

  // a save that lands first makes the draft stale, and the next attempt finds no draft
  const promoteAttempt = (fileId: string) =>
    Effect.gen(function* () {
      const draft = yield* Effect.mapError(findDraft({ fileId }), backendFault);
      if (Option.isNone(draft)) {
        const latest = yield* latestSnapshot(fileId);
        return { version: new FileVersion(latest), promoted: false };
      }
      yield* checkSize(draft.value.content);
      const version = yield* writeAttempt(fileId, draft.value.content, draft.value);
      return { version, promoted: true };
    });

  const promoteDraft = (fileId: string) =>
    Effect.gen(function* () {
      yield* requireFile(fileId);
      return yield* retryWhileMoved(promoteAttempt(fileId));
    });

  const marks = (versionId: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const rows = yield* Effect.mapError(findMarksInWorkspace({ wsId, versionId }), backendFault);
      return [...rows];
    });

  const addMark = (mark: Mark) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const version = yield* Effect.mapError(
        findVersionInWorkspace({ wsId, id: mark.versionId }),
        backendFault,
      );
      if (Option.isNone(version)) {
        return yield* Effect.fail(new FileMissingError({ versionId: mark.versionId }));
      }
      yield* Effect.mapError(insertMark(mark), backendFault);
    });

  const migrateAttempt = (fileId: string, fromVersionId: string) =>
    Effect.gen(function* () {
      const state = yield* Effect.mapError(findLatestState({ fileId }), backendFault);
      const latest = yield* latestSnapshot(fileId);
      if (latest.seq !== state.seq) return yield* Effect.fail(new LatestMoved());
      if (latest.id === fromVersionId) return { migrated: 0, stale: 0 };
      const from = yield* Effect.mapError(findVersion({ fileId, id: fromVersionId }), backendFault);
      if (Option.isNone(from)) {
        return yield* Effect.fail(new FileMissingError({ fileId, versionId: fromVersionId }));
      }
      const [fromMarks, latestMarks] = yield* Effect.mapError(
        Effect.all([findMarks({ versionId: fromVersionId }), findMarks({ versionId: latest.id })]),
        backendFault,
      );
      const onLatest = new Set(latestMarks.map((mark) => mark.threadId));
      const pending = fromMarks.filter((mark) => !onLatest.has(mark.threadId));
      if (pending.length === 0) return { migrated: 0, stale: 0 };
      const copies = yield* migrateMarksOnto(
        pending,
        latest.id,
        from.value.content,
        latest.content,
      );
      const inserts = yield* Effect.mapError(markInserts(copies), backendFault);
      yield* client
        .batch([guardLatest(fileId, state), ...inserts])
        .pipe(Effect.catch((cause) => conflictOr(cause, fileId, state)));
      return {
        migrated: copies.length,
        stale: copies.filter((mark) => mark.status === "stale").length,
      };
    });

  const migrateMarks = (fileId: string, fromVersionId: string) =>
    Effect.gen(function* () {
      yield* requireFile(fileId);
      return yield* retryWhileMoved(migrateAttempt(fileId, fromVersionId));
    });

  return Layer.succeed(
    Files,
    Files.of({
      list,
      resolve,
      create,
      read,
      versions,
      write,
      writeDraft,
      readDraft,
      promoteDraft,
      marks,
      addMark,
      migrateMarks,
    }),
  );
}
