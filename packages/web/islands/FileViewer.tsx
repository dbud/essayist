import { selectedFile } from "@/signals.ts";
import { useFileContent } from "@/hooks/useFiles.ts";
import Tabs from "@/islands/Tabs.tsx";
import Toolbar from "@/components/Toolbar.tsx";
import FontSelect from "@/components/FontSelect.tsx";
import Editor from "@/islands/editor/Editor.tsx";
import { useEditorSnapshot } from "@/hooks/useEditorSnapshot.ts";
import { useMarkdownSnapshot } from "@/hooks/useMarkdownSnapshot.ts";
import { useDerivedSnapshot } from "@/hooks/useDerivedSnapshot.ts";

export default function FileViewer() {
  const path = selectedFile.value;
  if (!path) return null;
  return <FileViewerBody key={path} path={path} />;
}

function FileViewerBody({ path }: { path: string }) {
  const { content, loading, error } = useFileContent(path);
  const { editorSnapshot, setSnapshot } = useEditorSnapshot(path);
  const { snapshot, loading: snapshotLoading, derivedSnapshot } =
    useMarkdownSnapshot(
      path,
      content.value?.content ?? null,
      editorSnapshot,
    );
  useDerivedSnapshot(path, derivedSnapshot.value);

  if (error.value) {
    return <div class="text-error">{error.value}</div>;
  }

  return (
    <div class="flex flex-col h-full min-h-0">
      <Tabs />
      <div
        class={`text-sm bg-base-100 rounded-box rounded-tl-none
        flex-1 min-h-0 overflow-x-auto flex flex-col shadow
        ${loading.value || snapshotLoading.value ? "loading-border" : ""}`}
      >
        <Toolbar>
          <div class="flex items-center gap-4">
            <FontSelect />
          </div>
        </Toolbar>
        <div class="flex-1 min-h-0 flex flex-col overflow-x-auto overflow-y-auto p-4">
          {snapshot.value &&
            (
              <Editor
                onSnapshot={(state) => setSnapshot(state)}
                initialSnapshot={snapshot.value}
              />
            )}
          <div class="shrink-0 h-32" />
        </div>
      </div>
    </div>
  );
}
