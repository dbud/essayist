import { selectedFile } from "@/signals.ts";
import { useFiles } from "@/hooks/useFiles.ts";

export default function FileBrowser() {
  const { files, loading, error } = useFiles();

  if (loading.value) {
    return <span class="loading loading-spinner loading-sm" />;
  }

  if (error.value) {
    return <div class="text-error">{error.value}</div>;
  }

  return (
    <ul class="menu menu-compact bg-base-100 rounded-box">
      {files.value.map((file) => (
        <li key={file.path}>
          <a
            class={`font-mono text-sm ${
              selectedFile.value === file.path ? "active" : ""
            }`}
            onClick={() => selectedFile.value = file.path}
          >
            {file.path}
            <span class="text-base-content/40 ml-2">
              {file.lines} lines
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
