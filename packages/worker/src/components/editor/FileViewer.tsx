import { useRef } from "preact/hooks";
import { Caret } from "#/components/Caret.tsx";
import Editor from "#/components/editor/Editor.tsx";
import EditorToolbar from "#/components/editor/EditorToolbar.tsx";
import FileStats from "#/components/editor/FileStats.tsx";
import FontSelect from "#/components/editor/FontSelect.tsx";
import VersionPicker from "#/components/editor/VersionPicker.tsx";
import Overlay from "#/components/ui/Overlay.tsx";
import { useAutoSave } from "#/hooks/useAutoSave.ts";
import { useKeydown } from "#/hooks/useKeydown.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { getEditorSelection } from "#/signals/editorSelection.ts";
import { navigationOpened } from "#/signals/navigation.ts";

// TODO -- marks and sidenotes land with the wasm marks models -- ESS-84
/*
import { MarkBadges } from "#/components/MarkBadges.tsx";
import { MarkHighlights } from "#/components/MarkHighlights.tsx";
import Sidenotes from "#/components/Sidenotes.tsx";
import { useScrollViewport } from "#/hooks/useScrollViewport.ts";
import SidenoteControls from "#/islands/SidenoteControls.tsx";
*/
// TODO -- marks and sidenotes hook onto the wasm marks port -- ESS-84;
// the ref becomes useScrollViewport's
// import { getMarks } from "#/signals/marks.ts";
// import { getSidenotes } from "#/signals/sidenotes.ts";

export default function FileViewer() {
  const { workspaces, fileTrees } = useEditorModels();
  const wsId = workspaces.selectedId.value;
  const path = fileTrees.current.value?.selectedPath.value ?? null;
  const versionId = fileTrees.current.value?.selectedVersionId.value ?? null;
  if (wsId === null || path === null) return null;
  return (
    <FileViewerBody
      key={`${path}:${versionId ?? ""}`}
      wsId={wsId}
      path={path}
      versionId={versionId}
    />
  );
}

function FileViewerBody({
  wsId,
  path,
  versionId,
}: {
  wsId: string;
  path: string;
  versionId: string | null;
}) {
  const { fileContents } = useEditorModels();
  const file = fileContents.current.value;
  // TODO -- marks and sidenotes hook onto the wasm marks port -- ESS-84;
  // the ref becomes useScrollViewport's, and getSidenotes/getMarks join
  // selection alongside.
  // const { resolved } = getMarks(wsId, path, versionId);
  // const sidenotes = getSidenotes(wsId, path, versionId);
  const selection = getEditorSelection(wsId, path, versionId);
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
  // const withSidePane = resolved.value.length > 0;

  return (
    <div class="relative isolate flex-1 min-h-0 flex flex-col stack @container">
      <Overlay when={navigationOpened.value} local />
      <div class="z-toolbar flex flex-col bg-surface shadow-md">
        <div class="content-layout">
          <div class="content-main min-w-0">
            <div class="flex w-fit stack stack--row">
              <FontSelect />
              <EditorToolbar wsId={wsId} path={path} versionId={versionId} />
              <FileStats file={file} />
              <VersionPicker file={file} />
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
            {/* isolate: stacking context for MarkHighlights z-index */}
            {/* TODO -- highlights, badges and sidenotes land with the wasm
            marks models -- ESS-84; <Caret/> sits live below
            <MarkHighlights
              rects={sidenotes.markRects.value}
              activeIds={selection.markIds.value}
              innerId={selection.innerMarkId.value}
            />
            <MarkBadges badges={sidenotes.markBadges.value} />
            */}
            {file.state.value ? (
              <>
                <Editor
                  wsId={wsId}
                  file={file}
                  path={path}
                  versionId={versionId}
                  initialState={file.state.value}
                  onChange={file.setModifiedState}
                  className={`content-main pt-16 pb-32`}
                />
                <Caret rect={selection.caretRect} />
              </>
            ) : (
              <div class="content-main pt-16 pb-32">
                <p class="text-ink/70">
                  {file.loading.value ? "loading" : "empty"}
                </p>
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
