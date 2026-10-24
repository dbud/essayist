import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import type { EditorState } from "lexical";
import { useMemo } from "preact/hooks";
import ActiveEditorRef from "#/components/editor/ActiveEditorRef.tsx";
import { createEditorExtension } from "#/editor/extension.ts";
import { MARK_RANGE_TAG } from "#/editor/markExtension.ts";
import type { FileContent, FileKey } from "#/models/fileContent.ts";
import { usePreferences } from "#/models/preferences.ts";
import { getEditorSelection } from "#/signals/editorSelection.ts";
import { getMarks } from "#/signals/marks.ts";
import { getSidenotes } from "#/signals/sidenotes.ts";

interface EditorProps extends FileKey {
  file: FileContent;
  initialState: EditorState;
  onChange?: (state: EditorState) => void;
  className?: string;
}

export default function Editor({
  wsId,
  file,
  path,
  versionId,
  initialState,
  onChange,
  className,
}: EditorProps) {
  const { resolved } = getMarks(wsId, path, versionId);
  const { viewerFont } = usePreferences();
  const {
    positions: sidenotePositions,
    numbers: markNumbers,
    markBadges,
    markRects,
  } = getSidenotes(wsId, path, versionId);
  const markdown = file.markdown;
  const selection = getEditorSelection(wsId, path, versionId);
  const readOnly = versionId !== undefined;

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
        readOnly,
      }),
      $initialEditorState: initialState,
    }),
    [
      path,
      versionId,
      resolved,
      markdown,
      selection,
      markNumbers,
      markBadges,
      markRects,
    ],
  );

  // TODO -- the SSR prerender path needs the headless story (ESS-31);
  // extensions are client only, so the SSR markup is an empty editable.
  /*
  const prerenderedHtml = useMemo(() => {
    if (IS_BROWSER) return undefined;
    const editor = LexicalBuilder.fromExtensions([extension]).buildEditor();
    const html = withDOM(() =>
      editor.read(() => $generateHtmlFromNodes(editor, null)),
    );
    editor.dispose();
    return html;
  }, [extension]);
  */

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
            {readOnly ? "No content" : "Start writing..."}
          </span>
        }
      />
    ),
    [className, readOnly],
  );

  return (
    <div class={`relative ${viewerFont.value}`}>
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
