import { useMemo } from "preact/hooks";
import EditorToolbar from "@/components/EditorToolbar.tsx";
import FontSelect from "@/components/FontSelect.tsx";
import Sidenote from "@/components/Sidenote.tsx";
import Toolbar from "@/components/Toolbar.tsx";
import Editor from "@/islands/editor/Editor.tsx";
import FileViewerTabs from "@/islands/FileViewerTabs.tsx";
import SidebarToggle from "@/islands/SidebarToggle.tsx";
import { activeEditor } from "@/signals/activeEditor.ts";
import { getFile } from "@/signals/file.ts";
import { getMarks } from "@/signals/marks.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
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
  const { resolving, sidenotes } = getMarks(wsId, path);
  const resolvingVisible = useMemo(
    () => delayedRise(resolving, 150),
    [resolving],
  );
  const editorState = useMemo(() => state.value, [path, initialState.value]);

  if (error.value) {
    return <div class="text-error p-4 flex-1 min-h-0">{error.value}</div>;
  }

  return (
    <div
      class={`text-sm bg-base-100 rounded-box overflow-hidden
        flex-1 min-h-0 flex flex-col shadow
        ${loading.value || !state.value || resolvingVisible.value ? "loading-border" : ""}`}
    >
      <Toolbar>
        <FontSelect />
        <EditorToolbar wsId={wsId} path={path} />
      </Toolbar>
      {/* Editor and marks share one scroll context so a sidenote at `top: X`
          stays aligned with its mark at `offsetTop: X` while scrolling. */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        {/* 2:1 proportional split (Tufte-style margin). `relative` columns so
            mark anchors (MarkNode DOM) measure offsetTop against the editor. */}
        <div class="grid grid-cols-[2fr_1fr] gap-8">
          <div class="relative min-w-0">
            {editorState && (
              <Editor
                wsId={wsId}
                path={path}
                state={editorState}
                onChange={setModifiedState}
                className="p-16 pb-32"
              />
            )}
          </div>
          <div class="min-w-0 pr-16">
            <div class="relative">
              {sidenotes.value.map((s) => (
                <Sidenote
                  key={s.mark.thread_id}
                  mark={s.mark}
                  top={s.top}
                  active={s.active}
                  editor={activeEditor.value}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
