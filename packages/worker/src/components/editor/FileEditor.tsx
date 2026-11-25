import { useSignal } from "@preact/signals";

import { Caret } from "#/components/Caret.tsx";
import Editor from "#/components/editor/Editor.tsx";
import EditorToolbar from "#/components/editor/EditorToolbar.tsx";
import FileNavigation from "#/components/editor/FileNavigation.tsx";
import FileStats from "#/components/editor/FileStats.tsx";
import { MarkFragmentBadges } from "#/components/editor/MarkFragmentBadges.tsx";
import { MarkHighlights } from "#/components/editor/MarkHighlights.tsx";
import ReviewButton from "#/components/editor/ReviewButton.tsx";
import SidenoteControls from "#/components/editor/SidenoteControls.tsx";
import Sidenotes from "#/components/editor/Sidenotes.tsx";
import VersionPicker from "#/components/editor/VersionPicker.tsx";
import ErrorBoundary from "#/components/ErrorBoundary.tsx";
import EssayistLogo from "#/components/logo/EssayistLogo.tsx";
import Melt from "#/components/ui/Melt.tsx";
import Overlay from "#/components/ui/Overlay.tsx";
import { useAutoSave } from "#/hooks/useAutoSave.ts";
import { useKeydown } from "#/hooks/useKeydown.ts";
import { useSaveFile } from "#/hooks/useSaveFile.ts";
import { useScrollViewport, type ScrollContainerRef } from "#/hooks/useScrollViewport.ts";
import type { FileKey } from "#/models/fileSelection.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { getEditorSelection } from "#/signals/editorSelection.ts";

// Floating nav and toolbar rows over a full-height scroll area, content scrolling underneath. The
// local dim paints above the toolbar and stats rows and the version pill, while the filenav cluster
// rides z-panel above it so its dropdown keeps the pristine slot.
export default function FileEditor() {
  const { selected, sidenotes, fileContents } = useEditorModels();
  const scrollRef = useScrollViewport(sidenotes.scrollTop, sidenotes.viewportHeight);
  const navigationOpen = useSignal(false);

  const selection = selected.value !== null && selected.value.path !== null ? selected.value : null;
  const file =
    fileContents.current.value !== null && !fileContents.current.value.error.value
      ? fileContents.current.value
      : null;

  return (
    <div class="relative isolate flex-1 min-h-0 flex flex-col @container">
      <div class="relative flex-1 min-h-0 overflow-y-auto bg-paper striped/2" ref={scrollRef}>
        {selection !== null && (
          <FileSurface
            key={`${selection.path}:${selection.versionId}`}
            scrollContainerRef={scrollRef}
            {...selection}
          />
        )}
      </div>
      <Overlay when={navigationOpen.value} local />
      <Overlay when={file !== null && file.state.value === null} local capture />
      <div
        class="content-layout z-toolbar absolute inset-x-0 bottom-0 pointer-events-none"
        data-scroll-gap="bottom"
      >
        <div class="content-main flex justify-end pb-4">
          {selection !== null && file !== null && (
            <FileStats key={`${selection.path}:${selection.versionId}`} />
          )}
        </div>
      </div>
      <div class="absolute inset-x-0 top-0 pointer-events-none" data-scroll-gap="top">
        <div class="absolute inset-0 striped-8 fade [--fade-start:100%]" aria-hidden="true" />
        <div class="content-layout content-layout--side relative">
          <div class="content-main flex flex-col items-start py-3">
            <ErrorBoundary>
              <div class="flex gap-4 pointer-events-auto">
                <Melt class="self-stretch">
                  <EssayistLogo class="h-full w-8" />
                </Melt>
                <FileNavigation open={navigationOpen} />
                {file !== null && <VersionPicker />}
                {file !== null && <ReviewButton />}
              </div>
            </ErrorBoundary>
          </div>
        </div>
        {selection !== null && file !== null && (
          <div class="content-layout z-toolbar">
            <div class="content-main" />
            <div class="content-side flex items-start">
              <SidenoteControls />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FileSurface({
  wsId,
  path,
  versionId,
  scrollContainerRef,
}: FileKey & { scrollContainerRef: ScrollContainerRef }) {
  const { fileContents, resolvedMarks, sidenotes, writable } = useEditorModels();
  const file = fileContents.current.value;
  const save = useSaveFile(file);
  const selection = getEditorSelection({ wsId, path, versionId });
  const { markFragmentRects, markFragmentBadges, colorById } = sidenotes.current.value;

  useKeydown((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      void save();
    }
  });

  useAutoSave(file);

  if (file === null) {
    return <div class="bg-paper min-h-full p-4 pt-28 text-ink/70">no file selected</div>;
  }
  if (file.error.value) {
    return (
      <div class="bg-paper min-h-full p-4 pt-28">
        <p class="badge badge--error">{file.error.value}</p>
      </div>
    );
  }

  const withSidePane = resolvedMarks.resolved.value.length > 0;

  return (
    <div
      class={`isolate content-layout relative bg-paper min-h-full${
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
              className="content-main pt-28 pb-32"
            />
            <MarkHighlights
              rects={markFragmentRects.value}
              colorById={colorById.value}
              activeIds={selection.markIds.value}
              innerId={selection.innerMarkId.value}
            />
            <MarkFragmentBadges badges={markFragmentBadges.value} />
            <Caret rect={selection.caretRect} />
          </>
        ) : (
          <div class="content-main pt-28 pb-32">
            <p class="text-ink/70">{file.loading.value ? "loading" : "empty"}</p>
          </div>
        )}
      </div>
      <div class="content-side">
        <Sidenotes scrollContainerRef={scrollContainerRef} />
      </div>
      <EditorToolbar wsId={wsId} path={path} versionId={versionId} disabled={!writable.value} />
    </div>
  );
}
