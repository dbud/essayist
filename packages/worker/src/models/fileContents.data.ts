import { Schema } from "effect";
import { FileContentData } from "./fileContent.data.ts";

export const FileContentsData = Schema.Struct({
  wsId: Schema.NullOr(Schema.String),
  path: Schema.NullOr(Schema.String),
  content: Schema.NullOr(FileContentData),
});

export type FileContentsData = Schema.Schema.Type<typeof FileContentsData>;
