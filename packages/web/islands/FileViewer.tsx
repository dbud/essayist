import { selectedFile, viewerFont, viewMode } from "@/signals.ts";
import { useFileContent } from "@/hooks/useFiles.ts";
import Tabs from "@/islands/Tabs.tsx";
import Toolbar from "@/components/Toolbar.tsx";
import FontSelect from "@/components/FontSelect.tsx";
import ViewModeSelect from "@/components/ViewModeSelect.tsx";
import MarkdownView from "@/components/MarkdownView.tsx";
import Editor from "@/islands/Editor.tsx";
import { useSignal } from "@preact/signals";
import { Edit, X } from "lucide-preact";

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
        class={viewerFont.value}
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
  const editing = useSignal(false);

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
          <button
            type="button"
            class={`btn btn-sm gap-1 ${
              editing.value ? "btn-error" : "btn-primary"
            }`}
            onClick={() => (editing.value = !editing.value)}
          >
            {editing.value ? <X size={14} /> : <Edit size={14} />}
            {editing.value ? "Cancel" : "Edit"}
          </button>
        </Toolbar>
        <div class="flex-1 min-h-0 flex flex-col overflow-x-auto overflow-y-auto p-4">
          {content.value && content.value.content && (
            editing.value
              ? <Editor initialContent={content.value.content} />
              : <FileContent content={content.value.content} />
          )}
          <div class="shrink-0 h-32" />
        </div>
      </div>
    </div>
  );
}
