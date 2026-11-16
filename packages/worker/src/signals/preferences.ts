import { persistentSignal } from "#/utils/persistentSignal.ts";

export type FileStatSection = "words" | "chars" | "charsWithSpaces";

const FILE_STATS_DEFAULT: FileStatSection[] = ["words", "chars"];

export const fileStatsSections = persistentSignal<FileStatSection[]>(
  "fileStatsSections",
  FILE_STATS_DEFAULT,
);
