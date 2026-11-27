import { FileVersion } from "@essayist/core";
import { Schema } from "effect";

export const FileVersionsData = Schema.Array(FileVersion.json);

export type FileVersionsData = typeof FileVersionsData.Encoded;
