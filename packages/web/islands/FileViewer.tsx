import { selectedFile, viewerFont, viewMode } from "@/signals.ts";
import { useFileContent } from "@/hooks/useFiles.ts";
import Tabs from "@/islands/Tabs.tsx";
import Toolbar from "@/components/Toolbar.tsx";
import FontSelect from "@/components/FontSelect.tsx";
import ViewModeSelect from "@/components/ViewModeSelect.tsx";
import MarkdownView from "@/components/MarkdownView.tsx";

function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

function showMarkdown(): boolean {
  if (viewMode.value === "markdown") return true;
  if (viewMode.value === "plain") return false;
  return isMarkdown(selectedFile.value);
}

function FileContent({ content }: { content: string }) {
  if (showMarkdown()) {
    return (
      <MarkdownView
        content={content}
        class={`px-4 py-2 ${viewerFont.value}`}
      />
    );
  }

  return (
    <div class={`${viewerFont.value} prose whitespace-pre-wrap`}>
      {content}
    </div>
  );
}

export default function FileViewer() {
  const { content, loading, error } = useFileContent(selectedFile.value);

  if (!selectedFile.value) {
    return null;
  }

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
            <ViewModeSelect />
          </div>
        </Toolbar>
        <div class="flex-1 min-h-0 flex overflow-x-auto overflow-y-auto p-4">
          {content.value && content.value.content && (
            <FileContent content={content.value.content} />
          )}
          <div class="shrink-0 h-32" />
        </div>
      </div>
    </div>
  );
}
