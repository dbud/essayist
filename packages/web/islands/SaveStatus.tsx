import { CircleCheck, CircleDashed } from "lucide-preact";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { useTick } from "@/hooks/useTick.ts";
import { getFile } from "@/signals/file.ts";
import { autoSave } from "@/signals/preferences.ts";
import { formatDateTime, formatRelativeTime } from "@/utils/format.ts";

interface SaveStatusProps {
  wsId: string;
  path: string;
}

export default function SaveStatus({ wsId, path }: SaveStatusProps) {
  useTick(30_000);
  const file = getFile(wsId, path);
  const { saving, saveError, dirty, draft, checkpoint, loading, initialState } =
    file;
  const loadingFile = loading.value || initialState.value === null;

  const savedAt = loadingFile
    ? undefined
    : (draft.value?.timestamp ?? checkpoint.value?.timestamp);

  let label: string | null = null;
  if (!loadingFile) {
    label =
      savedAt === undefined ? "Saved" : `Saved ${formatRelativeTime(savedAt)}`;
    if (saving.value) label = "Saving...";
    else if (dirty.value && saveError.value) label = "Save failed";
    else if (dirty.value) {
      label = autoSave.value ? "Save pending" : "Unsaved changes";
    }
  }

  const tooltip =
    saveError.value ||
    (savedAt === undefined
      ? undefined
      : `Last saved: ${formatDateTime(savedAt)}`);

  const saved = !loadingFile && !saving.value && !dirty.value;
  const active = saving.value || loadingFile;

  return (
    <div
      class="cell cell--data relative w-52 whitespace-nowrap"
      data-tooltip={tooltip}
    >
      <WaveBars fill amplitude={active ? 0.5 : 0} class="text-ink" />
      {!loadingFile &&
        (saved ? (
          <CircleCheck size={14} class="shrink-0 text-ink" />
        ) : (
          <CircleDashed size={14} class="shrink-0 text-accent" />
        ))}
      {label}
    </div>
  );
}
