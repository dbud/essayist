import { sortBy } from "@std/collections";
import { ChevronDown, CircleDashed, LockKeyhole } from "lucide-preact";
import type { ComponentChild } from "preact";
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

  let label: ComponentChild | null = null;
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
      label = autoSave.value ? (
        "Save pending..."
      ) : (
        <>
          <kbd>{META_KEY}</kbd>
          <kbd>S</kbd> to save changes
        </>
      );
    }
  }

  const saved = !pending && !saving.value && !dirty.value;

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
      <Swappable swapKey={statusKey} class="swap-shift">
        {label}
      </Swappable>
    </span>
  );
}

function VersionChip({
  timestamp,
  lock,
}: {
  timestamp: number;
  lock?: boolean;
}) {
  return (
    <span class="inline-flex items-start gap-1">
      {lock && <LockKeyhole size={14} />}
      <span class="leading-none">{formatDateTime(timestamp)}</span>
    </span>
  );
}

export default function VersionPicker({
  wsId,
  path,
  versionId,
}: VersionPickerProps) {
  const { versions } = getVersionHistory(wsId, path);
  const list = sortBy(versions.value, (v) => v.timestamp, { order: "desc" });
  const selected = list.find((version) => version.version_id === versionId);
  const pending = useFileLoading(wsId, path);
  const active = getFile(wsId, path).saving.value || pending;

  function select(next: string | null) {
    getFileTreeFor(wsId).selectVersion(next);
  }

  return (
    <Dropdown
      // tooltip="Version history" TODO -- rework tooltip
      triggerClass="btn relative w-52 whitespace-nowrap"
      trigger={
        <>
          <WaveBars fill amplitude={active ? 0.5 : 0} class="text-ink" />
          <Swappable
            swapKey={versionId ?? "latest"}
            class="swap-shift self-start"
          >
            {selected ? (
              <VersionChip timestamp={selected.timestamp} lock />
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
              <VersionChip timestamp={version.timestamp} />
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
