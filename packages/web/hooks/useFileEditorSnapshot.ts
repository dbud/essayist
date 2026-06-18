import { editorSnapshots } from "@/signals.ts";
import { SerializedEditorState } from "lexical";

export function useFileEditorSnapshot(path: string) {
  const snapshot = editorSnapshots.value.get(path) ?? null;

  function setSnapshot(state: SerializedEditorState) {
    const next = new Map(editorSnapshots.value);
    next.set(path, state);
    editorSnapshots.value = next;
  }

  return { snapshot, setSnapshot };
}
