import { persistentSignal } from "@/utils/persistentSignal.ts";
import { signal } from "@preact/signals";
import { type LexicalEditor, SerializedEditorState } from "lexical";

export const selectedFile = persistentSignal("selectedFile", "");
export const openedFiles = persistentSignal<string[]>("openedFiles", []);
export const fileHistory = persistentSignal<string[]>("fileHistory", []);
export const viewerFont = persistentSignal<string>("viewerFont", "font-serif");
export const viewMode = persistentSignal<string>("viewMode", "auto");

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

export const activeEditor = signal<LexicalEditor | null>(null);

export const editorSnapshots = signal<Map<string, SerializedEditorState>>(
  new Map(),
);

export function setEditorSnapshot(path: string, state: SerializedEditorState) {
  const next = new Map(editorSnapshots.value);
  next.set(path, state);
  editorSnapshots.value = next;
}

export const editorBaselineSerializedSnapshots = signal<Record<string, string>>(
  {},
);

export function setBaselineSnapshot(path: string, serialized: string) {
  editorBaselineSerializedSnapshots.value = {
    ...editorBaselineSerializedSnapshots.value,
    [path]: serialized,
  };
}
