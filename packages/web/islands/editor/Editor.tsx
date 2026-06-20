import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { viewerFont } from "@/signals/preferences.ts";
import { defineExtension, EditorState } from "lexical";
import { HistoryExtension } from "@lexical/history";
import { RichTextExtension } from "@lexical/rich-text";
import {
  AutoFocusExtension,
  HorizontalRuleExtension,
} from "@lexical/extension";
import { LinkExtension } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { CodeExtension } from "@lexical/code";
import { useMemo } from "preact/hooks";

interface EditorProps {
  state: EditorState;
  onChange?: (state: EditorState) => void;
}

const editorExtension = defineExtension({
  name: "[root]",
  namespace: "essayist-editor",
  dependencies: [
    RichTextExtension,
    HistoryExtension,
    AutoFocusExtension,
    LinkExtension,
    ListExtension,
    CodeExtension,
    HorizontalRuleExtension,
  ],
});

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
  console.log("Editor", JSON.stringify(state));
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
      </LexicalExtensionComposer>
    </div>
  );
}
