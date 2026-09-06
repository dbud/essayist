import { CircleCheck, CircleDashed } from "lucide-preact";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { getFile } from "@/signals/file.ts";

interface SaveStatusProps {
  wsId: string;
  path: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SaveStatus({ wsId, path }: SaveStatusProps) {
  const file = getFile(wsId, path);
  const { saving, saveError, dirty, draft, checkpoint, loading, initialState } =
    file;
  const loadingFile = loading.value || initialState.value === null;

  let label: string | null = null;
  if (!loadingFile) {
    const savedAt = draft.value?.timestamp ?? checkpoint.value?.timestamp;
    label = savedAt === undefined ? "Saved" : `Saved ${formatTime(savedAt)}`;
    if (saving.value) label = "Saving...";
    else if (dirty.value && saveError.value) label = "Save failed";
    else if (dirty.value) label = "Unsaved";
  }

  const saved = !loadingFile && !saving.value && !dirty.value;
  const active = saving.value || loadingFile;

  return (
    <div
      class="cell cell--data relative w-42 whitespace-nowrap"
      title={saveError.value || label || ""}
    >
      <WaveBars fill amplitude={active ? 0.5 : 0} class="text-ink" />
      {!loadingFile &&
        (saved ? (
          <CircleCheck size={14} class="text-ink" />
        ) : (
          <CircleDashed size={14} class="text-accent" />
        ))}
      {label}
    </div>
  );
}
