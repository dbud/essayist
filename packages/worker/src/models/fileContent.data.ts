import { DraftSnapshot, FileSnapshot } from "@essayist/core";
import { Schema } from "effect";

export const FileContentData = Schema.Struct({
  version: FileSnapshot,
  draft: Schema.NullOr(DraftSnapshot),
});

export type FileContentData = typeof FileContentData.Encoded;
