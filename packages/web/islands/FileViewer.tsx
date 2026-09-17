import { History, X } from "lucide-preact";
import { Caret } from "@/components/Caret.tsx";
import { MarkBadges } from "@/components/MarkBadges.tsx";
import { MarkHighlights } from "@/components/MarkHighlights.tsx";
import Sidenotes from "@/components/Sidenotes.tsx";
import Overlay from "@/components/ui/Overlay.tsx";
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
import { type FileKey, getFile } from "@/signals/file.ts";
import { getFileTree, getFileTreeFor } from "@/signals/fileTree.ts";
import { getMarks } from "@/signals/marks.ts";
import { navigationOpened } from "@/signals/sidebar.ts";
import { getSidenotes } from "@/signals/sidenotes.ts";
import { getWorkspaces } from "@/signals/workspace.ts";
import { formatDateTime } from "@/utils/format.ts";

export default function FileViewer() {
  const wsId = getWorkspaces().selectedId.value;
  const tree = getFileTree();
  const path = tree?.selectedPath.value ?? "";
  if (!tree || !wsId || !path) return null;
  const versionId = tree.selectedVersionId.value ?? undefined;
  return (
    <FileViewerBody
      key={`${path}:${versionId ?? ""}`}
      wsId={wsId}
      path={path}
      versionId={versionId}
    />
  );
}

function FileViewerBody({ wsId, path, versionId }: FileKey) {
  const { state, checkpoint, setModifiedState, loading, error, save } = getFile(
    wsId,
    path,
    versionId,
  );
  const { resolved } = getMarks(wsId, path, versionId);
  const sidenotes = getSidenotes(wsId, path, versionId);
  const selection = getEditorSelection(wsId, path, versionId);
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
              {!versionId && <EditorToolbar wsId={wsId} path={path} />}
              <FileStats wsId={wsId} path={path} versionId={versionId} />
              {versionId ? (
                <VersionChip
                  title="Version view"
                  detail={
                    checkpoint.value === null
                      ? undefined
                      : formatDateTime(checkpoint.value.timestamp)
                  }
                  onExit={() => getFileTreeFor(wsId).selectVersion(null)}
                />
              ) : (
                <SaveStatus wsId={wsId} path={path} />
              )}
            </div>
          </div>
          <div class="content-side flex items-center">
            {!editorLoading && (
              <SidenoteControls wsId={wsId} path={path} versionId={versionId} />
            )}
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
              versionId={versionId}
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

// Toolbar chip shown while a snapshot is viewed: read-only, with an exit
// back to the live file.
function VersionChip({
  title,
  detail,
  onExit,
}: {
  title: string;
  detail?: string;
  onExit: () => void;
}) {
  return (
    <div
      class="flex w-52 items-center stack"
      data-tooltip="Viewing a saved version; editing is disabled"
    >
      <div class="cell cell--data relative min-w-0 flex-1 whitespace-nowrap">
        <History size={14} class="text-ink" />
        <span class="flex flex-col items-start leading-none">
          <span>{title}</span>
          {detail && <span class="text-[0.7rem] text-ink/50">{detail}</span>}
        </span>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-square"
        onClick={onExit}
      >
        <X size={14} />
      </button>
    </div>
  );
}
