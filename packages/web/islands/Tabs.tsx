import { closeFile, openedFiles, openFile, selectedFile } from "@/signals.ts";
import { FileText, X } from "lucide-preact";

export default function Tabs() {
  const files = openedFiles.value;

  if (files.length === 0) {
    return null;
  }

  return (
    <div class="tabs bg-base-200 flex-nowrap overflow-x-auto">
      {files.map((path) => {
        const name = path.split("/").pop() ?? path;
        const isActive = selectedFile.value === path;
        return (
          <a
            key={path}
            class={`tab shrink-0 ${
              isActive ? "tab-active bg-primary/10 shadow" : ""
            }`}
            onClick={() => openFile(path)}
          >
            <span class="flex items-center gap-2">
              <FileText size={14} />
              <span class="truncate max-w-24">{name}</span>
            </span>
            <button
              type="button"
              class="btn btn-ghost btn-xs p-0 w-5 h-5"
              onClick={(e) => {
                e.stopPropagation();
                closeFile(path);
              }}
            >
              <X size={12} />
            </button>
          </a>
        );
      })}
    </div>
  );
}
