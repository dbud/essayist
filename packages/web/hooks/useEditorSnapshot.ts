import { editorSnapshots, setEditorSnapshot } from "@/signals.ts";
import { SerializedEditorState } from "lexical";

export function useEditorSnapshot(path: string) {
  const editorSnapshot = editorSnapshots.value.get(path) ?? null;

  function setSnapshot(state: SerializedEditorState) {
    setEditorSnapshot(path, state);
  }

  return { editorSnapshot, setSnapshot };
}
