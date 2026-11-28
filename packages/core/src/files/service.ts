/**
 * Files, their versions and drafts, as an Effect service. A version is an immutable snapshot of a
 * file; the draft is the unsaved working copy on top of the latest version. Everything is scoped to
 * the current workspace: a file of another workspace, or a deleted file, reads as missing.
 */

import { Context, type Effect, type Option } from "effect";

import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import type {
  DraftStaleError,
  File,
  FileDraft,
  FileExistsError,
  FileMissingError,
  FileSnapshot,
  FileTooLargeError,
  FileVersion,
} from "./types.ts";

export interface Interface {
  /** The files of the workspace and their latest versions, by path. */
  list(): Effect.Effect<Array<{ file: File; latest: FileVersion }>, never, WorkspaceId>;
  fileAt(path: string): Effect.Effect<File, FileMissingError, WorkspaceId>;
  file(fileId: string): Effect.Effect<File, FileMissingError, WorkspaceId>;
  /** Create a file at a path, with the given id or a new one. */
  createAt(
    path: string,
    content: string,
    fileId?: string,
  ): Effect.Effect<
    { file: File; version: FileVersion },
    FileExistsError | FileTooLargeError,
    WorkspaceId
  >;
  /** Save a version of the file at a path, creating the file there when there is none. */
  writeAt(
    path: string,
    content: string,
  ): Effect.Effect<
    { file: File; version: FileVersion; created: boolean },
    FileTooLargeError,
    WorkspaceId
  >;

  /** A version with its content: the latest, or the given one. */
  read(
    fileId: string,
    versionId?: string,
  ): Effect.Effect<FileSnapshot, FileMissingError, WorkspaceId>;
  /** The versions of a file, oldest first. */
  versions(
    fileId: string,
  ): Effect.Effect<ReadonlyArray<FileVersion>, FileMissingError, WorkspaceId>;
  /** Save the draft, edited from `baseVersionId`; refused when that is no longer the latest. */
  writeDraft(
    fileId: string,
    baseVersionId: string,
    content: string,
  ): Effect.Effect<FileDraft, FileMissingError | FileTooLargeError | DraftStaleError, WorkspaceId>;
  readDraft(fileId: string): Effect.Effect<Option.Option<FileDraft>, FileMissingError, WorkspaceId>;
  /**
   * Save the draft as a new version and clear it. Without a draft nothing is written, and the
   * latest version is returned.
   */
  promoteDraft(
    fileId: string,
  ): Effect.Effect<{ version: FileVersion; promoted: boolean }, FileMissingError, WorkspaceId>;
}

export class Files extends Context.Service<Files, Interface>()("@essayist/core/files/Files") {}
