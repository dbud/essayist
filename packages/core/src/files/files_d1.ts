/**
 * A version computes its seq inside its insert, and D1 runs statements one at a time, so concurrent
 * saves of a file get consecutive versions with no conflict to retry. A draft is saved only on the
 * latest version and cleared in the same batch as every new version, so a draft is always on the
 * latest version.
 */

import type * as D1Client from "@effect/sql-d1/D1Client";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlSchema, type Statement } from "effect/sql";

import { Ids } from "#/idsRef.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { Files } from "./service.ts";
import {
  DraftStaleError,
  File,
  FileDraft,
  FileExistsError,
  FileMissingError,
  FileSnapshot,
  FileTooLargeError,
  FileVersion,
  MAX_DOCUMENT_BYTES,
} from "./types.ts";

const checkSize = (content: string) => {
  const bytes = new TextEncoder().encode(content).length;
  return bytes > MAX_DOCUMENT_BYTES ? Effect.fail(new FileTooLargeError({ bytes })) : Effect.void;
};

export function layerFilesD1(client: D1Client.D1Client): Layer.Layer<Files> {
  const findFile = SqlSchema.findOne({
    Request: Schema.Struct({ wsId: Schema.String, fileId: Schema.String }),
    Result: File,
    execute: ({ wsId, fileId }) =>
      client`SELECT * FROM files WHERE id = ${fileId} AND wsId = ${wsId} AND deletedAt IS NULL`,
  });

  const findFileByPath = SqlSchema.findOne({
    Request: Schema.Struct({ wsId: Schema.String, path: Schema.String }),
    Result: File,
    execute: ({ wsId, path }) =>
      client`SELECT * FROM files WHERE wsId = ${wsId} AND path = ${path} AND deletedAt IS NULL`,
  });

  const findLatestSnapshot = SqlSchema.findOne({
    Request: Schema.Struct({ fileId: Schema.String }),
    Result: FileSnapshot,
    execute: ({ fileId }) =>
      client`SELECT * FROM file_versions WHERE fileId = ${fileId} ORDER BY seq DESC LIMIT 1`,
  });

  const findSnapshot = SqlSchema.findOne({
    Request: Schema.Struct({ fileId: Schema.String, versionId: Schema.String }),
    Result: FileSnapshot,
    execute: ({ fileId, versionId }) =>
      client`SELECT * FROM file_versions WHERE id = ${versionId} AND fileId = ${fileId}`,
  });

  const findVersion = SqlSchema.findOne({
    Request: Schema.Struct({ versionId: Schema.String }),
    Result: FileVersion,
    execute: ({ versionId }) =>
      client`SELECT id, fileId, seq, createdAt FROM file_versions WHERE id = ${versionId}`,
  });

  const findVersions = SqlSchema.findAll({
    Request: Schema.Struct({ fileId: Schema.String }),
    Result: FileVersion,
    execute: ({ fileId }) =>
      client`SELECT id, fileId, seq, createdAt FROM file_versions
        WHERE fileId = ${fileId} ORDER BY seq`,
  });

  const latestVersionIdOf = (fileId: string) =>
    client`(SELECT id FROM file_versions WHERE fileId = ${fileId} ORDER BY seq DESC LIMIT 1)`;

  // runs on every autosave, so the checks are part of the statement: a file of the workspace that
  // is not deleted, and a base that is still the latest version
  const upsertDraft = SqlSchema.findOne({
    Request: Schema.Struct({
      wsId: Schema.String,
      baseVersionId: Schema.String,
      ...FileDraft.fields,
    }),
    Result: FileDraft,
    execute: ({ wsId, fileId, baseVersionId, content, updatedAt }) =>
      client`INSERT INTO file_drafts (fileId, content, updatedAt)
        SELECT ${fileId}, ${content}, ${updatedAt}
        WHERE EXISTS (
            SELECT 1 FROM files WHERE id = ${fileId} AND wsId = ${wsId} AND deletedAt IS NULL
          )
          AND ${latestVersionIdOf(fileId)} = ${baseVersionId}
        ON CONFLICT (fileId) DO UPDATE SET
          content = excluded.content,
          updatedAt = excluded.updatedAt
        RETURNING *`,
  });

  const findDraft = SqlSchema.findOneOption({
    Request: Schema.Struct({ fileId: Schema.String }),
    Result: FileDraft,
    execute: ({ fileId }) => client`SELECT * FROM file_drafts WHERE fileId = ${fileId}`,
  });

  /** The next version seq; `fileId` is a bound id, or a column of the enclosing statement. */
  const nextSeqOf = (fileId: string | Statement.Fragment) =>
    client`COALESCE((SELECT max(seq) FROM file_versions WHERE fileId = ${fileId}), 0) + 1`;

  // a deleted file keeps its rows, so every operation by id checks the file first
  const fileById = (fileId: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      return yield* Effect.catchTags(
        findFile({ wsId, fileId }),
        { NoSuchElementError: () => Effect.fail(new FileMissingError({ fileId })) },
        Effect.die,
      );
    });

  // a file always has a version, so none means the file is missing
  const latestSnapshot = (fileId: string) =>
    Effect.catchTags(
      findLatestSnapshot({ fileId }),
      { NoSuchElementError: () => Effect.fail(new FileMissingError({ fileId })) },
      Effect.die,
    );

  const list = () =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      // a single batch reads both at once, so every listed file has its latest version
      const [fileRows, versionRows] = yield* Effect.orDie(
        client.batch([
          client`SELECT * FROM files
            WHERE wsId = ${wsId} AND deletedAt IS NULL ORDER BY path`,
          client`SELECT v.id, v.fileId, v.seq, v.createdAt
            FROM file_versions v JOIN files f ON f.id = v.fileId
            WHERE f.wsId = ${wsId} AND f.deletedAt IS NULL
              AND v.seq = (SELECT max(seq) FROM file_versions WHERE fileId = f.id)`,
        ]),
      );
      const [files, latestVersions] = yield* Effect.orDie(
        Effect.all([
          Schema.decodeUnknownEffect(Schema.Array(File))(fileRows),
          Schema.decodeUnknownEffect(Schema.Array(FileVersion))(versionRows),
        ]),
      );
      const latestByFile = new Map(latestVersions.map((version) => [version.fileId, version]));
      return files.flatMap((file) => {
        const version = latestByFile.get(file.id);
        return version === undefined ? [] : [{ file, latest: version }];
      });
    });

  const fileAt = (path: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      return yield* Effect.catchTags(
        findFileByPath({ wsId, path }),
        { NoSuchElementError: () => Effect.fail(new FileMissingError({ path })) },
        Effect.die,
      );
    });

  const newFile = (path: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const ids = yield* Ids;
      return new File({
        id: ids.next(),
        wsId,
        path,
        createdAt: yield* DateTime.now,
        deletedAt: Option.none(),
        deletedBy: Option.none(),
      });
    });

  const createAt = (path: string, content: string) =>
    Effect.gen(function* () {
      yield* checkSize(content);
      const ids = yield* Ids;
      const file = yield* newFile(path);
      const snapshot = new FileSnapshot({
        id: ids.next(),
        fileId: file.id,
        seq: 1,
        createdAt: file.createdAt,
        content,
      });
      const fileRow = yield* Effect.orDie(Schema.encodeEffect(File)(file));
      const versionRow = yield* Effect.orDie(Schema.encodeEffect(FileSnapshot)(snapshot));
      // a single batch, so a file never exists without its first version
      yield* client
        .batch([
          client`INSERT INTO files ${client.insert([fileRow])}`,
          client`INSERT INTO file_versions ${client.insert([versionRow])}`,
        ])
        .pipe(
          // another file holds the path, or the backend failed
          Effect.catch((cause) =>
            fileAt(path).pipe(
              Effect.flatMap(() => Effect.fail(new FileExistsError({ path }))),
              Effect.catchTag("FileMissingError", () => Effect.die(cause)),
            ),
          ),
        );
      return { file, version: new FileVersion(snapshot) };
    });

  const writeAt = (path: string, content: string) =>
    Effect.gen(function* () {
      yield* checkSize(content);
      const { wsId } = yield* WorkspaceId;
      const ids = yield* Ids;
      const candidate = yield* newFile(path);
      const fileRow = yield* Effect.orDie(Schema.encodeEffect(File)(candidate));
      const versionId = ids.next();
      // a single batch, so a new file never exists without its first version: the file row goes in
      // only when no file holds the path, and the version goes to whichever file does
      yield* Effect.orDie(
        client.batch([
          client`INSERT INTO files ${client.insert([fileRow])}
            ON CONFLICT (wsId, path) WHERE deletedAt IS NULL DO NOTHING`,
          client`INSERT INTO file_versions (id, fileId, seq, createdAt, content)
            SELECT ${versionId}, f.id, ${nextSeqOf(client`f.id`)}, ${fileRow.createdAt}, ${content}
            FROM files f WHERE f.wsId = ${wsId} AND f.path = ${path} AND f.deletedAt IS NULL`,
          client`DELETE FROM file_drafts WHERE fileId = (
            SELECT id FROM files WHERE wsId = ${wsId} AND path = ${path} AND deletedAt IS NULL
          )`,
        ]),
      );
      // the batch wrote both rows, so a missing one is a defect
      const file = yield* Effect.catchTag(fileAt(path), "FileMissingError", Effect.die);
      const version = yield* Effect.catchTags(
        findVersion({ versionId }),
        { NoSuchElementError: Effect.die },
        Effect.die,
      );
      return { file, version, created: file.id === candidate.id };
    });

  const read = (fileId: string, versionId?: string) =>
    Effect.gen(function* () {
      yield* fileById(fileId);
      if (versionId === undefined) return yield* latestSnapshot(fileId);
      return yield* Effect.catchTags(
        findSnapshot({ fileId, versionId }),
        { NoSuchElementError: () => Effect.fail(new FileMissingError({ fileId, versionId })) },
        Effect.die,
      );
    });

  const versions = (fileId: string) =>
    Effect.gen(function* () {
      yield* fileById(fileId);
      return yield* Effect.orDie(findVersions({ fileId }));
    });

  const writeDraft = (fileId: string, baseVersionId: string, content: string) =>
    Effect.gen(function* () {
      yield* checkSize(content);
      const { wsId } = yield* WorkspaceId;
      return yield* Effect.catchTags(
        upsertDraft({ wsId, fileId, baseVersionId, content, updatedAt: yield* DateTime.now }),
        {
          // nothing saved: the file is missing, or a newer version was saved
          NoSuchElementError: () =>
            Effect.andThen(
              fileById(fileId),
              Effect.fail(new DraftStaleError({ fileId, baseVersionId })),
            ),
        },
        Effect.die,
      );
    });

  const readDraft = (fileId: string) =>
    Effect.gen(function* () {
      yield* fileById(fileId);
      return yield* Effect.orDie(findDraft({ fileId }));
    });

  const promoteDraft = (fileId: string) =>
    Effect.gen(function* () {
      yield* fileById(fileId);
      const ids = yield* Ids;
      const versionId = ids.next();
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      // a single batch, so the draft never outlives its promotion
      yield* Effect.orDie(
        client.batch([
          client`INSERT INTO file_versions (id, fileId, seq, createdAt, content)
            SELECT ${versionId}, fileId, ${nextSeqOf(fileId)}, ${createdAt}, content
            FROM file_drafts WHERE fileId = ${fileId}`,
          client`DELETE FROM file_drafts WHERE fileId = ${fileId}`,
        ]),
      );
      return yield* Effect.catchTags(
        Effect.map(findVersion({ versionId }), (version) => ({ version, promoted: true })),
        {
          // there was no draft, so no version was written
          NoSuchElementError: () =>
            Effect.map(latestSnapshot(fileId), (latest) => ({
              version: new FileVersion(latest),
              promoted: false,
            })),
        },
        Effect.die,
      );
    });

  return Layer.succeed(
    Files,
    Files.of({
      list,
      fileAt,
      file: fileById,
      createAt,
      writeAt,
      read,
      versions,
      writeDraft,
      readDraft,
      promoteDraft,
    }),
  );
}
