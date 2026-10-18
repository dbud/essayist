import { Schema } from "effect";
import { FileTreeData } from "./fileTree.data.ts";

export const FileTreesData = Schema.Struct({
  wsId: Schema.NullOr(Schema.String),
  tree: Schema.NullOr(FileTreeData),
});

export type FileTreesData = Schema.Schema.Type<typeof FileTreesData>;
