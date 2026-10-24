import { persistentSignal } from "#/utils/persistentSignal.ts";

export type FileStatSection = "words" | "chars" | "charsWithSpaces";

const FILE_STATS_DEFAULT: FileStatSection[] = ["words", "chars"];

export const fileStatsSections = persistentSignal<FileStatSection[]>(
  "fileStatsSections",
  FILE_STATS_DEFAULT,
);

export const autoSave = persistentSignal<boolean>("autoSave", true);
export const autoSaveInterval = persistentSignal<number>("autoSaveInterval", 5);
