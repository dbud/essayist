import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import {
  $convertFromMarkdownString,
  // $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import ErrorBoundary from "./ErrorBoundary.tsx";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { activeEditor, viewerFont } from "@/signals.ts";
import { LexicalEditor } from "lexical";

interface EditorProps {
  initialContent: string;
}

export default function Editor(
  { initialContent }: EditorProps,
) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "essayist-editor",
        theme: {},
        onError(e: Error) {
          console.log(e);
        },
        nodes: [
          HeadingNode,
          LinkNode,
          ListNode,
          ListItemNode,
          QuoteNode,
          CodeNode,
        ],
        editorState: () => {
          return $convertFromMarkdownString(
            initialContent,
            TRANSFORMERS,
          );
        },
      }}
    >
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
        editorRef={(editor: LexicalEditor) => activeEditor.value = editor}
      />
    </LexicalComposer>
  );
}
