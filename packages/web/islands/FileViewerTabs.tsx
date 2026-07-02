import { FileText, X } from "lucide-preact";
import Tabs from "@/components/Tabs.tsx";
import { useFile } from "@/signals/file.ts";
import { openedFiles } from "@/signals/openedFiles.ts";

function Tab({ path }: { path: string }) {
  const name = path.split("/").pop() ?? path;
  const { dirty, isSelected } = useFile(path);

  return (
    <button
      type="button"
      class={`tab shrink-0 rounded-t ${
        isSelected.value ? "tab-active bg-primary/10 shadow" : ""
      }`}
      onClick={() => openedFiles.open(path)}
    >
      <span class="flex items-center gap-2">
        <FileText size={14} />
        <span class="truncate max-w-48">{name}</span>

        {dirty.value ? (
          <span class="w-2 h-2 rounded-full bg-warning shrink-0" />
        ) : (
          <button
            type="button"
            class="btn btn-ghost btn-xs p-0 w-6 -mx-2"
            onClick={(e) => {
              e.stopPropagation();
              openedFiles.close(path);
            }}
          >
            <X size={12} />
          </button>
        )}
      </span>
    </button>
  );
}

export default function FileViewerTabs() {
  const files = openedFiles.opened.value;
  const selected = openedFiles.selected.value;

  if (files.length === 0) return null;

  return (
    <Tabs activeIndex={files.indexOf(selected)}>
      {files.map((path) => (
        <Tab key={path} path={path} />
      ))}
    </Tabs>
  );
}
