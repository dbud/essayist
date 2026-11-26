/**
 * Files, their versions and drafts, and the marks on versions, as an Effect service. Everything
 * is scoped to the current workspace: a file of another workspace, or a deleted file, reads as
 * missing.
 */

import { Context, type Effect, type Option } from "effect";

import type { PersistenceError } from "#/persistence/service.ts";
import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import type {
  File,
  FileDraft,
  FileExistsError,
  FileMissingError,
  FileSnapshot,
  FileTooLargeError,
  FileVersion,
  Mark,
} from "./types.ts";

export interface Interface {
  /** The files of the workspace and their latest versions by path, optionally under a prefix. */
  list(
    prefix?: string,
  ): Effect.Effect<Array<{ file: File; latest: FileVersion }>, PersistenceError, WorkspaceId>;
  resolve(path: string): Effect.Effect<File, PersistenceError | FileMissingError, WorkspaceId>;
  create(
    path: string,
    content: string,
  ): Effect.Effect<
    { file: File; version: FileVersion },
    PersistenceError | FileExistsError | FileTooLargeError,
    WorkspaceId
  >;

  /** A version with its content: the latest, or the given one. */
  read(
    fileId: string,
    versionId?: string,
  ): Effect.Effect<FileSnapshot, PersistenceError | FileMissingError, WorkspaceId>;
  /** The versions of a file, oldest first. */
  versions(
    fileId: string,
  ): Effect.Effect<FileVersion[], PersistenceError | FileMissingError, WorkspaceId>;
  /**
   * Save content as a new version. In the same atomic write, the marks of the previous version are
   * migrated onto it and the draft is cleared.
   */
  write(
    fileId: string,
    content: string,
  ): Effect.Effect<
    FileVersion,
    PersistenceError | FileMissingError | FileTooLargeError,
    WorkspaceId
  >;

  /** Save the draft on top of the latest version. */
  writeDraft(
    fileId: string,
    content: string,
  ): Effect.Effect<FileDraft, PersistenceError | FileMissingError | FileTooLargeError, WorkspaceId>;
  /** The draft, or none when there is none or it was written on an older version. */
  readDraft(
    fileId: string,
  ): Effect.Effect<Option.Option<FileDraft>, PersistenceError | FileMissingError, WorkspaceId>;
  /**
   * Save the draft as a new version. Without a draft, or when a save made the draft stale, nothing
   * is written and the latest version is returned.
   */
  promoteDraft(
    fileId: string,
  ): Effect.Effect<
    { version: FileVersion; promoted: boolean },
    PersistenceError | FileMissingError | FileTooLargeError,
    WorkspaceId
  >;

  /** The marks of a version, oldest first; none for a missing version. */
  marks(versionId: string): Effect.Effect<Mark[], PersistenceError, WorkspaceId>;
  addMark(mark: Mark): Effect.Effect<void, PersistenceError | FileMissingError, WorkspaceId>;
  /**
   * Copy the marks of an older version onto the latest, anchored again on its content. A thread
   * already on the latest is skipped. Nothing happens when `fromVersionId` is the latest.
   */
  migrateMarks(
    fileId: string,
    fromVersionId: string,
  ): Effect.Effect<
    { migrated: number; stale: number },
    PersistenceError | FileMissingError,
    WorkspaceId
  >;
}

export class Files extends Context.Service<Files, Interface>()("@essayist/core/files/Files") {}
