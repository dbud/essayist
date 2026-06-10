import { persistentSignal } from "@/utils/persistentSignal.ts";

export const selectedFile = persistentSignal("selectedFile", "");
export const openedFiles = persistentSignal<string[]>("openedFiles", []);
export const fileHistory = persistentSignal<string[]>("fileHistory", []);

export function openFile(path: string) {
  selectedFile.value = path;
  const current = openedFiles.value;
  if (!current.includes(path)) {
    openedFiles.value = [...current, path];
  }
  fileHistory.value = [path, ...fileHistory.value.filter((p) => p !== path)];
}

export function closeFile(path: string) {
  const remaining = openedFiles.value.filter((p) => p !== path);
  openedFiles.value = remaining;
  fileHistory.value = fileHistory.value.filter((p) => p !== path);
  if (selectedFile.value === path) {
    const mostRecent = fileHistory.value.find((p) => remaining.includes(p));
    selectedFile.value = mostRecent ?? remaining[0] ?? "";
  }
}
