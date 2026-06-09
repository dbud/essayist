import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface FileEntry {
  path: string;
  lines: number;
}

export default function FileBrowser() {
  const files = useSignal<FileEntry[]>([]);
  const loading = useSignal(true);
  const error = useSignal("");

  useEffect(() => {
    fetch("/api/files")
      .then((res) => res.json())
      .then((data) => {
        files.value = data;
        loading.value = false;
      })
      .catch((err) => {
        error.value = err.message;
        loading.value = false;
      });
  }, []);

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
          <a class="font-mono text-sm">
            {file.path}
            <span class="text-base-content/40 ml-2">{file.lines} lines</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
