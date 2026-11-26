import { Schema } from "effect";
import { Model } from "effect/schema";

/** The document size cap, in UTF-8 bytes; the tables enforce it too. */
export const MAX_DOCUMENT_BYTES = 1_000_000;

/** A document in a workspace. A deleted file keeps its versions and frees its path. */
export class File extends Model.Class<File>("File")({
  id: Model.GeneratedByApp(Schema.String),
  wsId: Schema.String,
  path: Schema.String,
  createdAt: Model.DateTimeInsert,
  deletedAt: Model.FieldOption(Schema.DateTimeUtcFromString),
  deletedBy: Model.FieldOption(Schema.String),
}) {}

/** A version of a file, without its content. `seq` counts from 1, so the highest is the latest. */
export class FileVersion extends Model.Class<FileVersion>("FileVersion")({
  id: Model.GeneratedByApp(Schema.String),
  fileId: Schema.String,
  seq: Schema.Int,
  createdAt: Model.DateTimeInsert,
}) {}

export class FileSnapshot extends Model.Class<FileSnapshot>("FileSnapshot")({
  ...Model.fields(FileVersion),
  content: Schema.String,
}) {}

/** The unsaved edits of a file, on top of the version they started from. */
export class FileDraft extends Model.Class<FileDraft>("FileDraft")({
  fileId: Schema.String,
  baseVersionId: Schema.String,
  content: Schema.String,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const MarkStatus = Schema.Literals(["resolved", "stale"]);
export type MarkStatus = typeof MarkStatus.Type;

/**
 * A review comment on a text span of a version. A new version gets a copy of each mark, anchored
 * again onto the new content: `resolved` when the text is found, `stale` when it is not. The copies
 * share `threadId`.
 */
export class Mark extends Model.Class<Mark>("Mark")({
  id: Model.GeneratedByApp(Schema.String),
  versionId: Schema.String,
  runId: Schema.String,
  unitId: Schema.String,
  threadId: Schema.String,
  categoryId: Model.FieldOption(Schema.String),
  selectedText: Schema.String,
  beforeContext: Schema.String,
  afterContext: Schema.String,
  comment: Schema.String,
  createdAt: Model.DateTimeInsert,
  offset: Schema.Int,
  length: Schema.Int,
  status: MarkStatus,
}) {}

/** A file, version or path that does not exist, or a deleted file. */
export class FileMissingError extends Schema.TaggedError<FileMissingError>()("FileMissingError", {
  path: Schema.optionalKey(Schema.String),
  fileId: Schema.optionalKey(Schema.String),
  versionId: Schema.optionalKey(Schema.String),
}) {
  override get message() {
    const what = [
      this.path === undefined ? null : `file ${this.path}`,
      this.fileId === undefined ? null : `file ${this.fileId}`,
      this.versionId === undefined ? null : `version ${this.versionId}`,
    ].filter((part) => part !== null);
    return `${what.join(", ")} does not exist`;
  }
}

/** Creating a file at a path already taken in the workspace. */
export class FileExistsError extends Schema.TaggedError<FileExistsError>()("FileExistsError", {
  path: Schema.String,
}) {
  override get message() {
    return `${this.path} already exists`;
  }
}

/** Content over {@linkcode MAX_DOCUMENT_BYTES}. */
export class FileTooLargeError extends Schema.TaggedError<FileTooLargeError>()(
  "FileTooLargeError",
  { bytes: Schema.Int },
) {
  override get message() {
    return `the document is ${this.bytes} bytes; the limit is ${MAX_DOCUMENT_BYTES}`;
  }
}
