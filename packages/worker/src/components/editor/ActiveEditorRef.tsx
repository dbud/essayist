import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "preact/hooks";
import { activeEditor } from "#/signals/activeEditor.ts";

export default function ActiveEditorRef() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    activeEditor.value = editor;
    return () => {
      // An unmount after a newer editor registered must leave it alone.
      if (activeEditor.value === editor) activeEditor.value = null;
    };
  }, [editor]);

  return null;
}
