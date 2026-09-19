import { ChevronDown, CircleDashed, LockKeyhole } from "lucide-preact";
import Dropdown, {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/Dropdown.tsx";
import { CircleCheckIcon } from "@/components/ui/icons.tsx";
import Swappable from "@/components/ui/Swappable.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { useBooting } from "@/hooks/useBooting.ts";
import { useTick } from "@/hooks/useTick.ts";
import type { FileKey } from "@/signals/file.ts";
import { getFile } from "@/signals/file.ts";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { autoSave } from "@/signals/preferences.ts";
import { getVersionHistory } from "@/signals/versionHistory.ts";
import { formatDateTime, formatRelativeTime } from "@/utils/format.ts";
import { META_KEY } from "@/utils/platform.ts";

type VersionPickerProps = FileKey;

function useFileLoading(wsId: string, path: string): boolean {
  const booting = useBooting();
  const { loading, initialState } = getFile(wsId, path);
  return loading.value || initialState.value === null || booting.value;
}

function SaveStatus({ wsId, path }: FileKey) {
  useTick(30_000);
  const file = getFile(wsId, path);
  const pending = useFileLoading(wsId, path);
  const { saving, saveError, dirty, draft, checkpoint } = file;

  const savedAt = pending
    ? undefined
    : (draft.value?.timestamp ?? checkpoint.value?.timestamp);

  let label: string | null = null;
  let statusKey = "";
  if (!pending) {
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

  const saved = !pending && !saving.value && !dirty.value;
  const showHint = !pending && !saving.value && dirty.value && !autoSave.value;

  return (
    <span class="inline-flex items-start gap-1">
      {!pending && (
        <Swappable
          swapKey={saved ? "check" : "dashed"}
          class="swap-rotate shrink-0"
        >
          {saved ? (
            <CircleCheckIcon size={14} class="text-ink" />
          ) : (
            <CircleDashed
              size={14}
              class="text-accent animate-[spin_3s_linear_infinite]"
            />
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
    </span>
  );
}

/** Chip for the picker trigger while a version is viewed. */
function ViewedVersion({ timestamp }: { timestamp: number }) {
  return (
    <span class="inline-flex items-center gap-1">
      <LockKeyhole size={14} />
      <span class="flex flex-col items-start leading-none">
        {formatDateTime(timestamp)}
      </span>
    </span>
  );
}

export default function VersionPicker({
  wsId,
  path,
  versionId,
}: VersionPickerProps) {
  const { versions } = getVersionHistory(wsId, path);
  const list = [...versions.value].sort((a, b) => b.timestamp - a.timestamp);
  const viewed = versionId
    ? list.find((version) => version.version_id === versionId)
    : undefined;
  const pending = useFileLoading(wsId, path);
  const active = getFile(wsId, path).saving.value || pending;

  function select(next: string | null) {
    getFileTreeFor(wsId).selectVersion(next);
  }

  return (
    <Dropdown
      // tooltip="Version history" TODO -- rework tooltip
      triggerClass="cell cell--data cursor-pointer relative w-52 whitespace-nowrap"
      trigger={
        <>
          <WaveBars fill amplitude={active ? 0.5 : 0} class="text-ink" />
          <Swappable
            swapKey={versionId ?? "latest"}
            class="swap-shift self-start"
          >
            {viewed ? (
              <ViewedVersion timestamp={viewed.timestamp} />
            ) : (
              <SaveStatus wsId={wsId} path={path} />
            )}
          </Swappable>
          {!pending && <ChevronDown size={14} class="rotate-on-open" />}
        </>
      }
    >
      {(close) => (
        <DropdownMenu class="dropdown-menu--full">
          <DropdownItem
            selected={!versionId}
            onClick={() => {
              select(null);
              close();
            }}
          >
            Latest
          </DropdownItem>
          {list.map((version) => (
            <DropdownItem
              key={version.version_id}
              selected={version.version_id === versionId}
              onClick={() => {
                select(version.version_id);
                close();
              }}
            >
              <div class="flex flex-col items-start">
                <span>{formatDateTime(version.timestamp)}</span>
              </div>
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
