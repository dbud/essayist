import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { viewerFont } from "@/signals.ts";
import { defineExtension, SerializedEditorState } from "lexical";
import { HistoryExtension } from "@lexical/history";
import { RichTextExtension } from "@lexical/rich-text";
import {
  AutoFocusExtension,
  HorizontalRuleExtension,
} from "@lexical/extension";
import { LinkExtension } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { CodeExtension } from "@lexical/code";
import { useEffect, useRef } from "preact/hooks";

interface EditorProps {
  initialSnapshot: SerializedEditorState;
  onChange?: (state: SerializedEditorState) => void;
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

/**
 * Sets the initial editor state once on mount.
 * Uses a ref flag to prevent re-setting state on subsequent renders.
 */
function InitialStatePlugin(
  { snapshot }: { snapshot: SerializedEditorState },
) {
  const [editor] = useLexicalComposerContext();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const editorState = editor.parseEditorState(JSON.stringify(snapshot));
    editor.setEditorState(editorState);
  }, [editor, snapshot]);

  return null;
}

export default function Editor({ initialSnapshot, onChange }: EditorProps) {
  const contentEditable = (
    <ContentEditable
      class={`prose ${viewerFont.value} whitespace-pre-wrap editor-input outline-none max-w-none`}
      placeholder={
        <span class="text-base-content/40 pointer-events-none">
          Start writing...
        </span>
      }
    />
  );

  return (
    <LexicalExtensionComposer
      extension={editorExtension}
      contentEditable={contentEditable}
    >
      <InitialStatePlugin snapshot={initialSnapshot} />
      {onChange
        ? (
          <OnChangePlugin
            onChange={(_editorState, _tags) => {
              onChange(_editorState.toJSON());
            }}
          />
        )
        : null}
    </LexicalExtensionComposer>
  );
}
