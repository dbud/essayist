import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { FileEntry, ReadResult } from "@essayist/core";

export function useFiles() {
  const files = useSignal<FileEntry[]>([]);
  const loading = useSignal(true);
  const error = useSignal("");

  useEffect(() => {
    fetch("/api/files")
      .then((res) => res.json())
      .then((data) => {
        files.value = data;
      })
      .catch((err) => {
        error.value = err.message;
      })
      .finally(() => {
        loading.value = false;
      });
  }, []);

  return { files, loading, error };
}

export function useFileContent(path: string) {
  const content = useSignal<ReadResult | null>(null);
  const loading = useSignal(false);
  const error = useSignal("");

  useEffect(() => {
    if (!path) {
      content.value = null;
      return;
    }

    loading.value = true;
    error.value = "";

    fetch(`/api/files/${encodeURIComponent(path)}`)
      .then((res) => res.json())
      .then((data: ReadResult) => {
        content.value = data;
      })
      .catch((err) => {
        error.value = err.message;
      })
      .finally(() => {
        loading.value = false;
      });
  }, [path]);

  return { content, loading, error };
}
