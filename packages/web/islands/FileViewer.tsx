import { useMemo } from "preact/hooks";
import { Caret } from "@/components/Caret.tsx";
import { MarkBadges } from "@/components/MarkBadges.tsx";
import { MarkHighlights } from "@/components/MarkHighlights.tsx";
import Sidenotes from "@/components/Sidenotes.tsx";
import Overlay from "@/components/ui/Overlay.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { useKeydown } from "@/hooks/useKeydown.ts";
import { useScrollViewport } from "@/hooks/useScrollViewport.ts";
import Editor from "@/islands/Editor.tsx";
import EditorToolbar from "@/islands/EditorToolbar.tsx";
import FileStats from "@/islands/FileStats.tsx";
import FontSelect from "@/islands/FontSelect.tsx";
import SaveStatus from "@/islands/SaveStatus.tsx";
import SidenoteControls from "@/islands/SidenoteControls.tsx";
import { activeEditor } from "@/signals/activeEditor.ts";
import { getEditorSelection } from "@/signals/editorSelection.ts";
import { getFile } from "@/signals/file.ts";
import { getMarks } from "@/signals/marks.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
import { navigationOpened } from "@/signals/sidebar.ts";
import { getSidenotes } from "@/signals/sidenotes.ts";
import { workspaces } from "@/signals/workspace.ts";
import { delayedRise } from "@/utils/delayedRise.ts";

export default function FileViewer() {
  const openedFiles = getOpenedFiles();
  const path = openedFiles?.selected.value ?? "";
  if (!openedFiles || !path) return null;
  const wsId = workspaces.currentWorkspaceId.value;
  return <FileViewerBody key={path} wsId={wsId} path={path} />;
}

function FileViewerBody({ wsId, path }: { wsId: string; path: string }) {
  const { state, setModifiedState, loading, error, save } = getFile(wsId, path);
  const { resolving, resolved } = getMarks(wsId, path);
  const sidenotes = getSidenotes(wsId, path);
  const selection = getEditorSelection(wsId, path);
  const resolvingVisible = useMemo(
    () => delayedRise(resolving, 150),
    [resolving],
  );
  const scrollRef = useScrollViewport(
    sidenotes.scrollTop,
    sidenotes.viewportHeight,
  );

  useKeydown((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      void save();
    }
  });

  if (error.value) {
    return <div class="text-error p-4 flex-1 min-h-0">{error.value}</div>;
  }

  const withSidePane = resolved.value.length > 0;
  const editorLoading = loading.value || !state.value;

  return (
    <div class="relative isolate flex-1 min-h-0 flex flex-col stack @container">
      <Overlay when={navigationOpened.value} local />
      <div class="z-toolbar flex flex-col bg-surface shadow-md">
        <div
          class={`content-layout ${withSidePane ? "content-layout--side" : ""}`}
        >
          <div class="content-main min-w-0">
            <div class="flex w-fit stack stack--row">
              <FontSelect />
              <EditorToolbar wsId={wsId} path={path} />
              <FileStats wsId={wsId} path={path} />
              <SaveStatus wsId={wsId} path={path} />
            </div>
          </div>
          <div class="content-side flex items-center">
            {!editorLoading &&
              (resolvingVisible.value ? (
                <WaveBars class="text-accent" />
              ) : (
                <SidenoteControls wsId={wsId} path={path} />
              ))}
          </div>
        </div>
      </div>
      <div
        class="relative flex-1 min-h-0 overflow-y-auto bg-paper striped/2"
        ref={scrollRef}
      >
        <div
          class={`isolate content-layout ${withSidePane ? "content-layout--side" : ""} bg-paper min-h-full`}
        >
          {/* isolate: stacking context for MarkHighlights z-index */}
          <div class="relative min-w-0 isolate">
            {state.value && (
              <Editor
                wsId={wsId}
                path={path}
                initialState={state.value}
                onChange={setModifiedState}
                className={`content-main pt-16 pb-32`}
              />
            )}
            <MarkBadges badges={sidenotes.markBadges.value} />
            <Caret rect={selection.caretRect} />
            <MarkHighlights
              rects={sidenotes.markRects.value}
              activeIds={selection.markIds.value}
              innerId={selection.innerMarkId.value}
            />
          </div>
          <div class="content-side">
            <Sidenotes
              wsId={wsId}
              path={path}
              editor={activeEditor.value}
              scrollContainerRef={scrollRef}
            />
          </div>
        </div>
        <Overlay when={editorLoading} local capture />
      </div>
    </div>
  );
}
