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

/** The unsaved edits of a file, on top of its latest version. */
export class FileDraft extends Model.Class<FileDraft>("FileDraft")({
  fileId: Schema.String,
  content: Schema.String,
  updatedAt: Schema.DateTimeUtcFromString,
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

/** A path with an empty, `.` or `..` segment, which a browser would rewrite in a URL. */
export class FilePathError extends Schema.TaggedError<FilePathError>()("FilePathError", {
  path: Schema.String,
}) {
  override get message() {
    return `${this.path} is not a valid file path`;
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

/** Saving a draft edited from a version that is no longer the latest. */
export class DraftStaleError extends Schema.TaggedError<DraftStaleError>()("DraftStaleError", {
  fileId: Schema.String,
  baseVersionId: Schema.String,
}) {
  override get message() {
    return "a newer version of this file was saved; reload to continue";
  }
}
