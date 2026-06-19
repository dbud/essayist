import Tabs from "@/islands/Tabs.tsx";
import Toolbar from "@/components/Toolbar.tsx";
import FontSelect from "@/components/FontSelect.tsx";
import { useFile } from "@/signals/file.ts";
import { openedFiles } from "@/signals/openedFiles.ts";

export default function FileViewer() {
  const path = openedFiles.selected.value;
  if (!path) return null;
  return <FileViewerBody key={path} path={path} />;
}

function FileViewerBody({ path }: { path: string }) {
  const { content, loading, error } = useFile(path);

  if (error.value) {
    return <div class="text-error">{error.value}</div>;
  }

  return (
    <div class="flex flex-col h-full min-h-0">
      <Tabs />
      <div
        class={`text-sm bg-base-100 rounded-box rounded-tl-none
        flex-1 min-h-0 overflow-x-auto flex flex-col shadow
        ${loading.value ? "loading-border" : ""}`}
      >
        <Toolbar>
          <div class="flex items-center gap-4">
            <FontSelect />
          </div>
        </Toolbar>
        <div class="flex-1 min-h-0 flex flex-col overflow-x-auto overflow-y-auto p-4">
          <pre class="text-xs whitespace-pre-wrap break-all">
            {JSON.stringify(content.value, null, 2)}
          </pre>
          <div class="shrink-0 h-32" />
        </div>
      </div>
    </div>
  );
}
