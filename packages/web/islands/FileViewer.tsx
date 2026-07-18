import { useMemo } from "preact/hooks";
import EditorToolbar from "@/components/EditorToolbar.tsx";
import FontSelect from "@/components/FontSelect.tsx";
import Toolbar from "@/components/Toolbar.tsx";
import Editor from "@/islands/editor/Editor.tsx";
import FileViewerTabs from "@/islands/FileViewerTabs.tsx";
import SidebarToggle from "@/islands/SidebarToggle.tsx";
import { useFile } from "@/signals/file.ts";
import { useMarks } from "@/signals/marks.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
import { delayedRise } from "@/utils/delayedRise.ts";

export default function FileViewer() {
  const openedFiles = getOpenedFiles();
  const path = openedFiles?.selected.value ?? "";
  if (!path) return null;
  return (
    <div class="flex flex-col h-full min-h-0">
      <div class="flex items-center gap-1">
        <SidebarToggle />
        <div class="flex-1 min-w-0">
          <FileViewerTabs />
        </div>
      </div>
      <FileViewerBody key={path} path={path} />
    </div>
  );
}

function FileViewerBody({ path }: { path: string }) {
  const { state, initialState, setModifiedState, loading, error } =
    useFile(path);
  const { resolving } = useMarks(path);
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
      class={`text-sm bg-base-100 rounded-box rounded-tl-none
        flex-1 min-h-0 overflow-x-auto flex flex-col shadow
        ${loading.value || !state.value || resolvingVisible.value ? "loading-border" : ""}`}
    >
      <Toolbar>
        <FontSelect />
        <EditorToolbar path={path} />
      </Toolbar>
      <div class="flex-1 min-h-0 flex flex-col overflow-x-auto overflow-y-auto p-4">
        {editorState && (
          <Editor path={path} state={editorState} onChange={setModifiedState} />
        )}
        <div class="shrink-0 h-32" />
      </div>
    </div>
  );
}
