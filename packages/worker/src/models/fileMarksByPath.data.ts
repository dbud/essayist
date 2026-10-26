import { Mark } from "@essayist/core";
import { Schema } from "effect";

export const FileMarksByPathData = Schema.Struct({
  wsId: Schema.NullOr(Schema.String),
  path: Schema.NullOr(Schema.String),
  versionId: Schema.NullOr(Schema.String),
  marks: Schema.NullOr(Schema.Array(Mark)),
});

export type FileMarksByPathData = Schema.Schema.Type<
  typeof FileMarksByPathData
>;
