import { selectedFile } from "@/signals.ts";
import { useFileContent } from "@/hooks/useFiles.ts";

export default function FileViewer() {
  const { content, loading, error } = useFileContent(selectedFile.value);

  if (!selectedFile.value) {
    return (
      <div class="text-base-content/50 text-center py-8">
        Select a file to view
      </div>
    );
  }

  if (loading.value) {
    return <span class="loading loading-spinner loading-sm" />;
  }

  if (error.value) {
    return <div class="text-error">{error.value}</div>;
  }

  if (content.value && content.value.content) {
    return (
      <pre class="font-mono text-sm whitespace-pre-wrap bg-base-100 p-4 rounded-box overflow-x-auto">
        {content.value.content}
      </pre>
    );
  }

  return null;
}
