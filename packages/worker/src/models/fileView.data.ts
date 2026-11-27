import { Schema } from "effect";

import { FileContentData } from "./fileContent.data.ts";
import { FileVersionsData } from "./fileVersions.data.ts";

export const FileViewData = Schema.Struct({
  content: FileContentData,
  versions: FileVersionsData,
});

export type FileViewData = typeof FileViewData.Encoded;
