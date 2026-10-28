import { Caret } from "#/components/Caret.tsx";
import Editor from "#/components/editor/Editor.tsx";
import EditorToolbar from "#/components/editor/EditorToolbar.tsx";
import FileStats from "#/components/editor/FileStats.tsx";
import FontSelect from "#/components/editor/FontSelect.tsx";
import { MarkBadges } from "#/components/editor/MarkBadges.tsx";
import { MarkHighlights } from "#/components/editor/MarkHighlights.tsx";
import Sidenotes from "#/components/editor/Sidenotes.tsx";
import VersionPicker from "#/components/editor/VersionPicker.tsx";
import Overlay from "#/components/ui/Overlay.tsx";
import { useAutoSave } from "#/hooks/useAutoSave.ts";
import { useKeydown } from "#/hooks/useKeydown.ts";
import { useScrollViewport } from "#/hooks/useScrollViewport.ts";
import type { FileKey } from "#/models/fileSelection.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { getEditorSelection } from "#/signals/editorSelection.ts";
import { navigationOpened } from "#/signals/navigation.ts";

export default function FileViewer() {
  const { selected } = useEditorModels();
  const selection = selected.value;
  if (selection === null || selection.path === null) return null;
  return (
    <FileViewerBody
      key={`${selection.path}:${selection.versionId}`}
      wsId={selection.wsId}
      path={selection.path}
      versionId={selection.versionId}
    />
  );
}

function FileViewerBody({ wsId, path, versionId }: FileKey) {
  const { fileContents, writable, resolvedMarks, sidenotes } = useEditorModels();
  const file = fileContents.current.value;
  const selection = getEditorSelection({ wsId, path, versionId });
  const side = sidenotes.current.value;
  const { markRects, markBadges } = side;
  const scrollRef = useScrollViewport(sidenotes.scrollTop, sidenotes.viewportHeight);

  useKeydown((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      void file?.save();
    }
  });

  useAutoSave(file);

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

  const editorLoading = file.state.value === null;
  const withSidePane = resolvedMarks.resolved.value.length > 0;

  return (
    <div class="relative isolate flex-1 min-h-0 flex flex-col stack @container">
      <Overlay when={navigationOpened.value} local />
      <div class="z-toolbar flex flex-col bg-surface shadow-md">
        <div class="content-layout">
          <div class="content-main min-w-0">
            <div class="flex w-fit stack stack--row">
              <FontSelect />
              <EditorToolbar
                wsId={wsId}
                path={path}
                versionId={versionId}
                disabled={!writable.value}
              />
              <FileStats />
              <VersionPicker />
            </div>
          </div>
          <div class="content-side flex items-center">
            {/* TODO -- SidenoteControls lands with the review runner -- ESS-94 */}
          </div>
        </div>
      </div>
      <div class="relative flex-1 min-h-0 overflow-y-auto bg-paper striped/2" ref={scrollRef}>
        <div
          class={`isolate content-layout bg-paper min-h-full${
            withSidePane ? " content-layout--side" : ""
          }`}
        >
          <div class="relative min-w-0 isolate">
            {/* isolate: stacking context for MarkHighlights z-index; the
            overlay divs come after the editor so wavy strokes and badges
            paint over the native selection, while the negative-z band layer
            stays behind the text */}
            {file.state.value ? (
              <>
                <Editor
                  wsId={wsId}
                  path={path}
                  versionId={versionId}
                  initialState={file.state.value}
                  onChange={file.setModifiedState}
                  className={`content-main pt-16 pb-32`}
                />
                <MarkHighlights
                  rects={markRects.value}
                  activeIds={selection.markIds.value}
                  innerId={selection.innerMarkId.value}
                />
                <MarkBadges badges={markBadges.value} />
                <Caret rect={selection.caretRect} />
              </>
            ) : (
              <div class="content-main pt-16 pb-32">
                <p class="text-ink/70">{file.loading.value ? "loading" : "empty"}</p>
              </div>
            )}
          </div>
          <div class="content-side">
            <Sidenotes scrollContainerRef={scrollRef} />
          </div>
        </div>
        <Overlay when={editorLoading} local capture />
      </div>
    </div>
  );
}
