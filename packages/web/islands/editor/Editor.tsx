import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import ErrorBoundary from "@/islands/ErrorBoundary.tsx";
import { activeEditor, viewerFont } from "@/signals.ts";
import { LexicalEditor, SerializedEditorState } from "lexical";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { nodes } from "@/islands/editor/nodes.ts";

interface EditorProps {
  onSnapshot: (state: SerializedEditorState) => void;
  initialSnapshot: SerializedEditorState;
}

export default function Editor(
  { onSnapshot, initialSnapshot }: EditorProps,
) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "essayist-editor",
        onError(e: Error) {
          console.log(e);
        },
        nodes,
        editorState: JSON.stringify(initialSnapshot),
      }}
    >
      <OnChangePlugin
        onChange={(editorState) => onSnapshot(editorState.toJSON())}
      />

      <RichTextPlugin
        contentEditable={
          <ContentEditable
            class={`prose ${viewerFont.value} whitespace-pre-wrap editor-input outline-none`}
            placeholder={
              <span class="text-base-content/40 pointer-events-none">
                Start writing...
              </span>
            }
          />
        }
        ErrorBoundary={ErrorBoundary}
      />
      <HistoryPlugin />
      <EditorRefPlugin
        editorRef={(editor: LexicalEditor) => {
          activeEditor.value = editor;
          return () => {
            activeEditor.value = null;
          };
        }}
      />
    </LexicalComposer>
  );
}
