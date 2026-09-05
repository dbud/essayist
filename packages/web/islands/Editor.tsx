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
  initialState: EditorState;
  onChange?: (state: EditorState) => void;
  className?: string;
}

export default function Editor({
  wsId,
  path,
  initialState,
  onChange,
  className,
}: EditorProps) {
  const { resolved } = getMarks(wsId, path);
  const {
    positions: sidenotePositions,
    numbers: markNumbers,
    markBadges,
    markRects,
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
        markRects,
      }),
      $initialEditorState: initialState,
    }),
    [path, resolved, markdown, selection, markNumbers, markBadges, markRects],
  );

  const contentEditable = useMemo(
    () => (
      <ContentEditable
        // TODO -- Lexical doesn't seem to pass these attributes
        // TODO -- extract setting to preferences
        spellcheck="false"
        autocorrect="off"
        autocapitalize="off"
        class={`prose whitespace-pre-wrap editor-input outline-none max-w-none ${className}`}
        placeholder={
          <span class="absolute left-4 top-16 @[64rem]:left-16 text-ink/40 pointer-events-none prose pl-1">
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
