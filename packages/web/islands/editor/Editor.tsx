import { CodeExtension } from "@lexical/code";
import {
  AutoFocusExtension,
  HorizontalRuleExtension,
} from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { LinkExtension } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextExtension } from "@lexical/rich-text";
import { configExtension, defineExtension, type EditorState } from "lexical";
import { useMemo } from "preact/hooks";
import { viewerFont } from "@/signals/preferences.ts";

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
    configExtension(AutoFocusExtension, { defaultSelection: "rootStart" }),
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
