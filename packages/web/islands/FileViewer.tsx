import { selectedFile } from "@/signals.ts";
import { useFileContent } from "@/hooks/useFiles.ts";
import { FileText } from "lucide-preact";

export default function FileViewer() {
  const { content, loading, error } = useFileContent(selectedFile.value);

  if (!selectedFile.value) {
    return null;
  }

  if (loading.value) {
    return <span class="loading loading-spinner loading-sm" />;
  }

  if (error.value) {
    return <div class="text-error">{error.value}</div>;
  }

  return (
    <div class="flex flex-col h-full">
      <div class="tabs tabs-boxed bg-base-200 rounded-box rounded-b-none">
        <a class="tab tab-active gap-2">
          <FileText size={14} />
          {selectedFile.value.split("/").pop()}
        </a>
      </div>
      {content.value && content.value.content && (
        <pre class="font-mono text-sm whitespace-pre-wrap bg-base-100 p-4 rounded-box rounded-t-none flex-1 overflow-x-auto">
          {content.value.content}
        </pre>
      )}
    </div>
  );
}
