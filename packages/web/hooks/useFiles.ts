import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { FileEntry } from "@essayist/core";
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
