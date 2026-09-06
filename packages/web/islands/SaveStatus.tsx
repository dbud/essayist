import { CircleDashed } from "lucide-preact";
import { CircleCheckIcon } from "@/components/ui/icons.tsx";
import Swappable from "@/components/ui/Swappable.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { useTick } from "@/hooks/useTick.ts";
import { getFile } from "@/signals/file.ts";
import { autoSave } from "@/signals/preferences.ts";
import { formatDateTime, formatRelativeTime } from "@/utils/format.ts";
import { META_KEY } from "@/utils/platform.ts";

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
  let statusKey = "";
  if (!loadingFile) {
    statusKey = "saved";
    label =
      savedAt === undefined ? "Saved" : `Saved ${formatRelativeTime(savedAt)}`;
    if (saving.value) {
      statusKey = "saving";
      label = "Saving...";
    } else if (dirty.value && saveError.value) {
      statusKey = "failed";
      label = "Save failed";
    } else if (dirty.value) {
      statusKey = "dirty";
      label = autoSave.value ? "Save pending..." : "Unsaved changes";
    }
  }

  const tooltip =
    saveError.value ||
    (savedAt === undefined
      ? undefined
      : `Last saved: ${formatDateTime(savedAt)}`);

  const saved = !loadingFile && !saving.value && !dirty.value;
  const active = saving.value || loadingFile;
  const showHint =
    !loadingFile && !saving.value && dirty.value && !autoSave.value;

  return (
    <div
      class="cell cell--data relative w-52 whitespace-nowrap"
      data-tooltip={tooltip}
    >
      <WaveBars fill amplitude={active ? 0.5 : 0} class="text-ink" />
      {!loadingFile && (
        <Swappable
          swapKey={saved ? "check" : "dashed"}
          class="swap-rotate shrink-0"
        >
          {saved ? (
            <CircleCheckIcon size={14} class="text-ink" />
          ) : (
            <CircleDashed size={14} class="text-accent" />
          )}
        </Swappable>
      )}
      {showHint ? (
        <span class="flex flex-col items-start gap-1 leading-none">
          <Swappable swapKey={statusKey} class="swap-shift">
            {label}
          </Swappable>
          <span class="text-[0.7rem] text-ink opacity-50 hover:opacity-100">
            <kbd>{META_KEY}</kbd>
            <kbd>S</kbd>
            {" to save"}
          </span>
        </span>
      ) : (
        <Swappable swapKey={statusKey} class="swap-shift">
          {label}
        </Swappable>
      )}
    </div>
  );
}
