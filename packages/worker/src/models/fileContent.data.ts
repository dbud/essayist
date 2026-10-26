import { DraftSnapshot, FileSnapshot } from "@essayist/core";
import { Schema } from "effect";

export const FileContentData = Schema.Struct({
  version: FileSnapshot,
  draft: Schema.NullOr(DraftSnapshot),
  writable: Schema.Boolean,
});

export type FileContentData = Schema.Schema.Type<typeof FileContentData>;
