import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import type { EditorState, LexicalEditor } from "lexical";
import { useMemo } from "preact/hooks";
import { viewerFont } from "@/signals/preferences.ts";
import { activeEditor } from "@/signals.ts";
import editorExtension from "./extension.ts";

interface EditorProps {
  state: EditorState;
  onChange?: (state: EditorState) => void;
}

const contentEditable = (
  <ContentEditable
    class={`prose whitespace-pre-wrap editor-input outline-none max-w-none`}
    placeholder={
      <span class="text-base-content/40 pointer-events-none">
        Start writing...
      </span>
    }
  />
);

export default function Editor({ state, onChange }: EditorProps) {
  const extension = useMemo(
    () => ({
      ...editorExtension,
      $initialEditorState: state,
    }),
    [state],
  );

  return (
    <div class={`${viewerFont}`}>
      <LexicalExtensionComposer
        extension={extension}
        contentEditable={contentEditable}
      >
        {onChange && <OnChangePlugin onChange={onChange} />}
        <EditorRefPlugin
          editorRef={(editor: LexicalEditor) => (activeEditor.value = editor)}
        />
      </LexicalExtensionComposer>
    </div>
  );
}
