import type { ReadonlySignal, Signal } from "@preact/signals";
import type { LexicalEditor } from "lexical";
import { useMemo } from "preact/hooks";
import { MarkBadges } from "@/components/MarkBadges.tsx";
import { MarkHighlights } from "@/components/MarkHighlights.tsx";
import { MarkSwatches } from "@/components/MarkSwatches.tsx";
import Sidenote from "@/components/Sidenote.tsx";
import { useElementHeights } from "@/hooks/useElementHeights.ts";
import {
  type ScrollContainerRef,
  useScrollViewport,
} from "@/hooks/useScrollViewport.ts";
import Editor from "@/islands/Editor.tsx";
import EditorToolbar from "@/islands/EditorToolbar.tsx";
import FontSelect from "@/islands/FontSelect.tsx";
import { activeEditor } from "@/signals/activeEditor.ts";
import { getEditorSelection } from "@/signals/editorSelection.ts";
import { getFile } from "@/signals/file.ts";
import { getMarks } from "@/signals/marks.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
import type {
  SidenoteEntry,
  SidenoteHeights,
  SidenoteView,
} from "@/signals/sidenotes.ts";
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
  const { state, initialState, setModifiedState, loading, error } = getFile(
    wsId,
    path,
  );
  const { resolving, resolved } = getMarks(wsId, path);
  const sidenotes = getSidenotes(wsId, path);
  const resolvingVisible = useMemo(
    () => delayedRise(resolving, 150),
    [resolving],
  );
  const editorState = useMemo(() => state.value, [path, initialState.value]);
  const scrollRef = useScrollViewport(
    sidenotes.scrollTop,
    sidenotes.viewportHeight,
  );

  if (error.value) {
    return <div class="text-error p-4 flex-1 min-h-0">{error.value}</div>;
  }

  const withSidePane = resolved.value.length > 0;

  return (
    <div
      class={`text-sm
        flex-1 min-h-0 flex flex-col shadow @container
        ${loading.value || !state.value || resolvingVisible.value ? "loading-border" : ""}`}
    >
      <div class="flex-1 min-h-0 overflow-y-auto" ref={scrollRef}>
        <div class="sticky top-0 z-toolbar flex flex-col shadow-none">
          {/*<BackdropBlur class="--bg-paper/50" plateau={0.1} />*/}
          <div
            class={`content-layout ${withSidePane ? "content-layout--side" : ""}`}
          >
            <div class="content-main min-w-0 flex flex-col gap-2 py-3">
              <div class="flex items-center gap-2">
                <FontSelect />
                <EditorToolbar wsId={wsId} path={path} />
              </div>
            </div>
          </div>
        </div>
        <div
          class={`content-layout ${withSidePane ? "content-layout--side" : ""}`}
        >
          {/* isolate: stacking context for MarkHighlights z-index */}
          <div class="relative min-w-0 isolate">
            {editorState && (
              <Editor
                wsId={wsId}
                path={path}
                state={editorState}
                onChange={setModifiedState}
                className={`content-main pt-16 pb-32`}
              />
            )}
            <MarkBadges badges={sidenotes.markBadges.value} />
            <MarkHighlights
              rects={sidenotes.markRects.value}
              activeIds={getEditorSelection(wsId, path).markIds.value}
            />
          </div>
          <div class="content-side">
            <Sidenotes
              heights={sidenotes.heights}
              entries={sidenotes.entries}
              views={sidenotes.viewportLayout}
              editor={activeEditor.value}
              scrollContainerRef={scrollRef}
            />
          </div>
        </div>
      </div>
      {/* TEMPORARY palette preview. */}
      <MarkSwatches />
    </div>
  );
}

interface SidenotesProps {
  heights: Signal<SidenoteHeights>;
  entries: ReadonlySignal<SidenoteEntry[]>;
  views: ReadonlySignal<SidenoteView[]>;
  editor: LexicalEditor | null;
  scrollContainerRef: ScrollContainerRef;
}

function Sidenotes({
  heights,
  entries,
  views,
  editor,
  scrollContainerRef,
}: SidenotesProps) {
  // Measure rendered sidenote heights for stacking. Re-measure when the
  // entries change and on marks-column width changes. `entries` is independent
  // of `heights`, so this can't cycle with its own output. Sidenotes stay
  // visibility:hidden until measured so the unstacked first paint never shows
  // overlap. Ghosts omit data-thread-id so they aren't measured.
  const innerRef = useElementHeights<HTMLDivElement>(heights, {
    selector: "[data-thread-id]",
    key: "threadId",
    deps: [entries.value],
  });

  return (
    <div class="relative" ref={innerRef}>
      {views.value.map((v) => (
        <Sidenote
          key={v.key}
          mark={v.entry.mark}
          number={v.entry.number}
          top={v.top}
          active={v.entry.active}
          hidden={!heights.value.has(v.entry.mark.thread_id)}
          editor={editor}
          ghost={v.ghost}
          trueTop={v.trueTop}
          scrollContainerRef={scrollContainerRef}
        />
      ))}
    </div>
  );
}
