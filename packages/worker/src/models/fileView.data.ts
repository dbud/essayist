import { Schema } from "effect";
import { FileContentData } from "./fileContent.data.ts";
import { FileVersionsData } from "./fileVersions.data.ts";
import { MarksData } from "./marks.data.ts";

export const FileViewData = Schema.Struct({
  content: FileContentData,
  versions: FileVersionsData,
  marks: MarksData,
});

export type FileViewData = Schema.Schema.Type<typeof FileViewData>;
