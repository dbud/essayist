import { FileVersion } from "@essayist/core";
import { Schema } from "effect";

export const FileVersionsByPathData = Schema.Struct({
  wsId: Schema.NullOr(Schema.String),
  path: Schema.NullOr(Schema.String),
  versions: Schema.NullOr(Schema.Array(FileVersion)),
});

export type FileVersionsByPathData = Schema.Schema.Type<
  typeof FileVersionsByPathData
>;
