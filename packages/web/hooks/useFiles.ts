import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { FileEntry, FileSnapshot } from "@essayist/core";
import { usePersistentSignal } from "@/utils/persistentSignal.ts";

export function useFiles() {
  const files = usePersistentSignal<FileEntry[]>("files", []);
  const loading = useSignal(false);
  const error = useSignal("");

  useEffect(() => {
    loading.value = true;
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
  const content = usePersistentSignal<FileSnapshot | null>(
    `file:${path}`,
    null,
  );
  const loading = useSignal(false);
  const error = useSignal("");

  useEffect(() => {
    if (!path) {
      content.value = null;
      return;
    }

    const controller = new AbortController();

    loading.value = true;
    error.value = "";

    fetch(`/api/files/${encodeURIComponent(path)}`)
      .then((res) => res.json())
      .then((data: FileSnapshot) => {
        content.value = data;
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          error.value = err.message;
        }
        error.value = err.message;
      })
      .finally(() => {
        loading.value = false;
      });

    return () => controller.abort();
  }, [path]);

  return { content, loading, error };
}
