import { FileVersion } from "@essayist/core";
import { Schema } from "effect";

export const FileVersionData = FileVersion.json;
export type FileVersionData = typeof FileVersionData.Encoded;

export const FileVersionsData = Schema.Array(FileVersionData);
export type FileVersionsData = typeof FileVersionsData.Encoded;
