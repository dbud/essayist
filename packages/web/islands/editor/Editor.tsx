import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import type { EditorState } from "lexical";
import { useMemo } from "preact/hooks";
import { createEditorExtension } from "@/editor/extension.ts";
import { MARK_RANGE_TAG } from "@/editor/markExtension.ts";
import { getEditorSelection } from "@/signals/editorSelection.ts";
import { getFile } from "@/signals/file.ts";
import { getMarks } from "@/signals/marks.ts";
import { viewerFont } from "@/signals/preferences.ts";
import { getSidenotes } from "@/signals/sidenotes.ts";
import ActiveEditorRef from "./ActiveEditorRef.tsx";

interface EditorProps {
  wsId: string;
  path: string;
  state: EditorState;
  onChange?: (state: EditorState) => void;
  className?: string;
}

export default function Editor({
  wsId,
  path,
  state,
  onChange,
  className,
}: EditorProps) {
  const { resolved } = getMarks(wsId, path);
  const {
    positions: sidenotePositions,
    numbers: markNumbers,
    markBadges,
  } = getSidenotes(wsId, path);
  const { markdown } = getFile(wsId, path);
  const selection = getEditorSelection(wsId, path);

  const extension = useMemo(
    () => ({
      ...createEditorExtension(path, {
        resolved,
        markdown,
        selection,
        sidenotePositions,
        markNumbers,
        markBadges,
      }),
      $initialEditorState: state,
    }),
    // Signals/model are stable per path, so the memo effectively keys on path/state.
    [path, state, resolved, markdown, selection, markNumbers, markBadges],
  );

  const contentEditable = useMemo(
    () => (
      <ContentEditable
        class={`prose whitespace-pre-wrap editor-input outline-none max-w-none ${className}`}
        placeholder={
          <span class="absolute left-4 top-16 @[64rem]:left-16 text-base-content/40 pointer-events-none prose pl-1">
            Start writing...
          </span>
        }
      />
    ),
    [className],
  );

  return (
    <div class={`relative ${viewerFont}`}>
      <LexicalExtensionComposer
        extension={extension}
        contentEditable={contentEditable}
      >
        {onChange && (
          <OnChangePlugin
            onChange={(state, _, tags) => {
              if (!tags.has(MARK_RANGE_TAG)) onChange(state);
            }}
          />
        )}
        <MarkdownShortcutPlugin />
        <ActiveEditorRef />
      </LexicalExtensionComposer>
    </div>
  );
}
