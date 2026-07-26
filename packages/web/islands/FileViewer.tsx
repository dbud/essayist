import type { ReadonlySignal, Signal } from "@preact/signals";
import type { LexicalEditor } from "lexical";
import { useMemo } from "preact/hooks";
import EditorToolbar from "@/components/EditorToolbar.tsx";
import FontSelect from "@/components/FontSelect.tsx";
import { MarkBadges } from "@/components/MarkBadges.tsx";
import Sidenote from "@/components/Sidenote.tsx";
import Toolbar from "@/components/Toolbar.tsx";
import { useElementHeights } from "@/hooks/useElementHeights.ts";
import Editor from "@/islands/editor/Editor.tsx";
import FileViewerTabs from "@/islands/FileViewerTabs.tsx";
import SidebarToggle from "@/islands/SidebarToggle.tsx";
import { activeEditor } from "@/signals/activeEditor.ts";
import { getFile } from "@/signals/file.ts";
import { getMarks } from "@/signals/marks.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
import type { SidenoteEntry, SidenoteHeights } from "@/signals/sidenotes.ts";
import { getSidenotes } from "@/signals/sidenotes.ts";
import { workspaces } from "@/signals/workspace.ts";
import { delayedRise } from "@/utils/delayedRise.ts";

export default function FileViewer() {
  const openedFiles = getOpenedFiles();
  const path = openedFiles?.selected.value ?? "";
  if (!openedFiles || !path) return null;
  const wsId = workspaces.currentWorkspaceId.value;
  return (
    <div class="flex flex-col h-full min-h-0">
      <div class="flex items-center gap-1 pr-10">
        <SidebarToggle side="left" label="Toggle file browser" />
        <div class="flex-1 min-w-0">
          <FileViewerTabs />
        </div>
        <SidebarToggle side="right" label="Toggle inspector" />
      </div>
      <FileViewerBody key={path} wsId={wsId} path={path} />
    </div>
  );
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

  if (error.value) {
    return <div class="text-error p-4 flex-1 min-h-0">{error.value}</div>;
  }

  // Toolbar and body grids share these so their columns stay aligned.
  // No marks: sidenote column collapses on narrow panes (1fr_0fr), expands at
  // @[64rem]=1024px; @[96rem]=1536px caps the grid width at 1400px.
  const gridCols =
    resolved.value.length > 0
      ? "grid-cols-[2fr_1fr] gap-4 @[64rem]:gap-8"
      : "grid-cols-[1fr_0fr] gap-0 @[64rem]:grid-cols-[2fr_1fr] @[64rem]:gap-8";
  // Editor-pane horizontal inset (body keeps vertical padding on contentEditable).
  const editorPad = "px-4 @[64rem]:px-16";
  // Side-pane column.
  const sidePane = "min-w-0 pr-4 @[64rem]:pr-16";

  return (
    <div
      class={`text-sm bg-base-100 rounded-box overflow-hidden
        flex-1 min-h-0 flex flex-col shadow @container
        ${loading.value || !state.value || resolvingVisible.value ? "loading-border" : ""}`}
    >
      {/* Toolbar mirrors the body grid split so editor controls align with the
          editor content and the right column reserves space for future mark /
          sidenote controls. */}
      <Toolbar>
        <div class={`grid w-full mx-auto @[96rem]:max-w-[1400px] ${gridCols}`}>
          <div class={`min-w-0 ${editorPad} flex items-center gap-2`}>
            <FontSelect />
            <EditorToolbar wsId={wsId} path={path} />
          </div>
          <div class={sidePane} />
        </div>
      </Toolbar>
      {/* Editor and marks share one scroll context so a sidenote stays aligned
          with its mark while scrolling. */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        {/* Tufte-style 2:1 split. `relative` columns so mark anchors measure
            offsetTop against the editor. @container on the root keys the
            @[64rem]/@[96rem] variants on pane width. */}
        <div class={`grid ${gridCols} mx-auto @[96rem]:max-w-[1400px]`}>
          <div class="relative min-w-0">
            {editorState && (
              <Editor
                wsId={wsId}
                path={path}
                state={editorState}
                onChange={setModifiedState}
                className={`${editorPad} pt-16 pb-32`}
              />
            )}
            <MarkBadges badges={sidenotes.markBadges.value} />
          </div>
          {/* Inner `relative` so the column's pr-4 insets the absolutely-positioned
              sidenotes (otherwise right-0 would reach the pane edge). */}
          <div class={sidePane}>
            <Sidenotes
              heights={sidenotes.heights}
              entries={sidenotes.entries}
              layout={sidenotes.layout}
              editor={activeEditor.value}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface SidenotesProps {
  heights: Signal<SidenoteHeights>;
  entries: ReadonlySignal<SidenoteEntry[]>;
  layout: ReadonlySignal<Map<string, number>>;
  editor: LexicalEditor | null;
}

function Sidenotes({ heights, entries, layout, editor }: SidenotesProps) {
  // Measure rendered sidenote heights for stacking. Re-measures when the
  // entries change and on marks-column width changes. `entries` is independent
  // of `heights`, so this can't cycle with its own output. Sidenotes stay
  // visibility:hidden until measured so the unstacked first paint never shows
  // overlap.
  const innerRef = useElementHeights<HTMLDivElement>(heights, {
    selector: "[data-thread-id]",
    key: "threadId",
    deps: [entries.value],
  });

  return (
    <div class="relative" ref={innerRef}>
      {entries.value.map((e) => (
        <Sidenote
          key={e.mark.thread_id}
          mark={e.mark}
          number={e.number}
          top={layout.value.get(e.mark.thread_id) ?? e.markTop}
          active={e.active}
          hidden={!heights.value.has(e.mark.thread_id)}
          editor={editor}
        />
      ))}
    </div>
  );
}
