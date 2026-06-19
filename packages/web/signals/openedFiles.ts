import { persistentSignal } from "@/utils/persistentSignal.ts";
import { createModel } from "@preact/signals";

export const OpenedFilesModel = createModel(() => {
  const selected = persistentSignal("selectedFile", "");
  const opened = persistentSignal<string[]>("openedFiles", []);
  const history = persistentSignal<string[]>("fileHistory", []);

  function open(path: string) {
    selected.value = path;
    const current = opened.value;
    if (!current.includes(path)) {
      opened.value = [...current, path];
    }
    history.value = [path, ...history.value.filter((p) => p !== path)];
  }

  function close(path: string) {
    const remaining = opened.value.filter((p) => p !== path);
    opened.value = remaining;
    history.value = history.value.filter((p) => p !== path);
    if (selected.value === path) {
      const mostRecent = history.value.find((p) => remaining.includes(p));
      selected.value = mostRecent ?? remaining[0] ?? "";
    }
  }

  return {
    opened,
    selected,
    open,
    close,
  };
});

export const openedFiles = new OpenedFilesModel();
