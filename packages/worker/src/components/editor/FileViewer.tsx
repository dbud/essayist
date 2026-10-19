import { useRef } from "preact/hooks";
import FontSelect from "#/components/editor/FontSelect.tsx";
import Overlay from "#/components/ui/Overlay.tsx";
import { useKeydown } from "#/hooks/useKeydown.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { navigationOpened } from "#/signals/sidebar.ts";

// TODO -- version picker, file stats, marks and the lexical editor land
// with the version-history and marks models -- ESS-84
/*
import { Caret } from "#/components/Caret.tsx";
import { MarkBadges } from "#/components/MarkBadges.tsx";
import { MarkHighlights } from "#/components/MarkHighlights.tsx";
import Sidenotes from "#/components/Sidenotes.tsx";
import { useScrollViewport } from "#/hooks/useScrollViewport.ts";
import Editor from "#/islands/Editor.tsx";
import EditorToolbar from "#/islands/EditorToolbar.tsx";
import FileStats from "#/components/editor/FileStats.tsx";
import SidenoteControls from "#/islands/SidenoteControls.tsx";
import VersionPicker from "#/components/editor/VersionPicker.tsx";
import { activeEditor } from "#/signals/activeEditor.ts";
import { getEditorSelection } from "#/signals/editorSelection.ts";
import { type FileKey, getFile } from "#/signals/file.ts";
import { getFileTree } from "#/signals/fileTree.ts";
import { getMarks } from "#/signals/marks.ts";
import { getSidenotes } from "#/signals/sidenotes.ts";
import { getWorkspaces } from "#/signals/workspace.ts";
*/

export default function FileViewer() {
  const { fileTrees } = useEditorModels();
  const path = fileTrees.current.value?.selectedPath.value;
  if (!path) return null;
  // TODO -- version views join via tree.selectedVersionId -- ESS-84
  return <FileViewerBody key={path} path={path} />;
}

function FileViewerBody({ path }: { path: string }) {
  const { fileContents } = useEditorModels();
  const file = fileContents.current.value;
  // TODO -- marks, sidenotes and editor selection hook up with the marks
  // port; the ref becomes useScrollViewport's -- ESS-84
  // const { resolved } = getMarks(wsId, path, versionId);
  // const sidenotes = getSidenotes(wsId, path, versionId);
  // const selection = getEditorSelection(wsId, path, versionId);
  // const scrollRef = useScrollViewport(
  //   sidenotes.scrollTop,
  //   sidenotes.viewportHeight,
  // );
  const scrollRef = useRef<HTMLDivElement>(null);

  useKeydown((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      void file?.save();
    }
  });

  if (file === null) {
    return <div class="flex-1 min-h-0 p-4 text-ink/70">no file selected</div>;
  }
  if (file.error.value) {
    return (
      <div class="flex-1 min-h-0 p-4">
        <p class="badge badge--error">{file.error.value}</p>
      </div>
    );
  }

  const editorLoading = file.content.value === null;
  // const withSidePane = resolved.value.length > 0;

  return (
    <div class="relative isolate flex-1 min-h-0 flex flex-col stack @container">
      <Overlay when={navigationOpened.value} local />
      <div class="z-toolbar flex flex-col bg-surface shadow-md">
        <div class="content-layout">
          <div class="content-main min-w-0">
            <div class="flex w-fit stack stack--row">
              <FontSelect />
              {/* TODO -- editor toolbar (ESS-31), file stats, version
              picker -- ESS-84
              <EditorToolbar
                wsId={wsId}
                path={path}
                versionId={versionId}
                disabled={readOnly.value}
              />
              <FileStats wsId={wsId} path={path} versionId={versionId} />
              <VersionPicker wsId={wsId} path={path} versionId={versionId} />
              */}
            </div>
          </div>
          <div class="content-side flex items-center">
            {/* TODO -- sidenote controls with the marks port -- ESS-84
            {!editorLoading && (
              <SidenoteControls wsId={wsId} path={path} versionId={versionId} />
            )}
            */}
          </div>
        </div>
      </div>
      <div
        class="relative flex-1 min-h-0 overflow-y-auto bg-paper striped/2"
        ref={scrollRef}
      >
        <div class="isolate content-layout bg-paper min-h-full">
          <div class="relative min-w-0 isolate">
            {/* TODO -- lexical editor (ESS-31); caret, highlights, badges
            and sidenotes land with the marks models -- ESS-84
            {state.value && (
              // Lexical SSR is pending (ESS-31); the editor hydrates from
              // the SSR-seeded cache instead of rendering its content.
              <Editor
                wsId={wsId}
                path={path}
                versionId={versionId}
                initialState={state.value}
                onChange={setModifiedState}
                className={`content-main pt-16 pb-32`}
              />
            )}
            <Caret rect={selection.caretRect} />
            <MarkHighlights
              rects={sidenotes.markRects.value}
              activeIds={selection.markIds.value}
              innerId={selection.innerMarkId.value}
            />
            <MarkBadges badges={sidenotes.markBadges.value} />
            */}
            {file.content.value !== null ? (
              <div class="content-main pt-16 pb-32">
                <textarea
                  class="h-48 w-full border border-black/10 p-5 font-mono text-xs"
                  value={file.content.value}
                  onInput={(e) => {
                    file.content.value = e.currentTarget.value;
                  }}
                ></textarea>
                <div class="mt-2 flex items-center">
                  <button
                    class="btn btn--ghost"
                    type="button"
                    disabled={file.saving.value || !file.dirty.value}
                    onClick={() => void file.save()}
                  >
                    save draft
                  </button>
                  {file.dirty.value ? (
                    <span class="text-ink/60">unsaved</span>
                  ) : null}
                  {file.saving.value ? (
                    <span class="text-ink/60">saving</span>
                  ) : null}
                </div>
                <pre class="mt-10 whitespace-pre-wrap text-xs leading-snug text-ink/70">
                  {JSON.stringify(
                    {
                      file: path,
                      version: file.version.value?.version_id ?? null,
                      draft: file.draft.value?.timestamp ?? null,
                      dirty: file.dirty.value,
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            ) : (
              <div class="content-main pt-16 pb-32">
                <p class="text-ink/70">{editorLoading ? "loading" : "empty"}</p>
              </div>
            )}
          </div>
          <div class="content-side">
            {/* TODO -- ESS-84
            <Sidenotes
              wsId={wsId}
              path={path}
              versionId={versionId}
              editor={activeEditor.value}
              scrollContainerRef={scrollRef}
            />
            */}
          </div>
        </div>
        <Overlay when={editorLoading} local capture />
      </div>
    </div>
  );
}
