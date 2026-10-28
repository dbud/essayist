import { buildEditorFromExtensions } from "@lexical/extension";
import { $generateHtmlFromNodes } from "@lexical/html";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import type { EditorState } from "lexical";
import { useMemo } from "preact/hooks";

import ActiveEditorRef from "#/components/editor/ActiveEditorRef.tsx";
import { createEditorExtension } from "#/editor/extension.ts";
import { MARK_RANGE_TAG } from "#/editor/markExtension.ts";
import { withDOM } from "#/editor/withDOM.ts";
import type { FileContent } from "#/models/fileContent.ts";
import type { FileKey } from "#/models/fileSelection.ts";
import { usePreferences } from "#/models/preferences.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { getEditorSelection } from "#/signals/editorSelection.ts";

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
  const { viewerFont } = usePreferences();
  const { writable, resolvedMarks, categories, sidenotes } = useEditorModels();
  const markdown = file.markdown;
  const selection = getEditorSelection({ wsId, path, versionId });
  const resolved = resolvedMarks.resolved;
  const {
    positions: sidenotePositions,
    numbers: markNumbers,
    markBadges,
    markRects,
  } = sidenotes.current.value;

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
        categories,
        fonts: [viewerFont],
        writable: writable.value,
      }),
      $initialEditorState: initialState,
    }),
    [
      path,
      versionId,
      sidenotePositions,
      markNumbers,
      markBadges,
      markRects,
      resolved,
      markdown,
      selection,
      categories,
      viewerFont,
      writable.value,
    ],
  );

  const prerenderedHtml = useMemo(() => {
    if (!import.meta.env.SSR) return undefined;
    return withDOM(() => {
      const editor = buildEditorFromExtensions(extension);
      const html = editor.read(() => $generateHtmlFromNodes(editor, null));
      editor.dispose();
      return html;
    });
  }, [extension]);

  const contentEditable = useMemo(
    () => (
      <ContentEditable
        // TODO -- Lexical doesn't seem to pass these attributes
        // TODO -- extract setting to preferences
        spellcheck="false"
        autocorrect="off"
        autocapitalize="off"
        dangerouslySetInnerHTML={
          prerenderedHtml === undefined ? undefined : { __html: prerenderedHtml }
        }
        class={`prose whitespace-pre-wrap editor-input outline-none max-w-none ${className}`}
        placeholder={
          <span class="absolute left-4 top-16 @[64rem]:left-16 text-ink/40 pointer-events-none prose pl-1">
            {writable.value ? "Start writing..." : "No content"}
          </span>
        }
      />
    ),
    [className, writable.value, prerenderedHtml],
  );

  return (
    <div class={`relative ${viewerFont.value}`}>
      <LexicalExtensionComposer extension={extension} contentEditable={contentEditable}>
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
