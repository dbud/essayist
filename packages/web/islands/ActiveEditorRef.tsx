import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import type { LexicalEditor } from "lexical";
import { useEffect } from "preact/hooks";
import { activeEditor } from "@/signals/activeEditor.ts";

export default function ActiveEditorRef() {
  useEffect(() => () => (activeEditor.value = null), []);

  return (
    <EditorRefPlugin
      editorRef={(editor: LexicalEditor) => (activeEditor.value = editor)}
    />
  );
}
