import { FileVersion } from "@essayist/core";
import { Schema } from "effect";

export const FileVersionsData = Schema.Struct({
  list: Schema.Array(FileVersion),
  latestVersionId: Schema.NullOr(Schema.String),
});

export type FileVersionsData = Schema.Schema.Type<typeof FileVersionsData>;
