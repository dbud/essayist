import { selectedFile } from "@/signals.ts";
import { useFileContent } from "@/hooks/useFiles.ts";
import Tabs from "@/islands/Tabs.tsx";
import MarkdownView from "@/components/MarkdownView.tsx";

function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
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
    <div class="flex flex-col h-full">
      <Tabs />
      <div
        class={`text-sm bg-base-100 p-4 rounded-box rounded-tl-none flex-1 overflow-x-auto flex relative shadow ${
          loading.value ? "loading-border" : ""
        }`}
      >
        {content.value && content.value.content && (
          isMarkdown(selectedFile.value)
            ? (
              <MarkdownView
                content={content.value.content}
                class="flex-1 px-4 py-2"
              />
            )
            : (
              <>
                <div class="font-mono text-base-content/30 select-none shrink-0 text-right pr-4">
                  {content.value.content.split("\n").map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <div class="font-serif whitespace-pre-wrap flex-1">
                  {content.value.content}
                </div>
              </>
            )
        )}
      </div>
    </div>
  );
}
