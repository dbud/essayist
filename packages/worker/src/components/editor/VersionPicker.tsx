import { sortBy } from "@std/collections";
import { ChevronDown, CircleDashed, LockKeyhole } from "lucide-preact";
import type { ComponentChild } from "preact";
import Dropdown, {
  DropdownItem,
  DropdownMenu,
} from "#/components/ui/Dropdown.tsx";
import { CircleCheckIcon } from "#/components/ui/icons.tsx";
import Swappable from "#/components/ui/Swappable.tsx";
import WaveBars from "#/components/ui/WaveBars.tsx";
import { useBooting } from "#/hooks/useBooting.ts";
import { useTick } from "#/hooks/useTick.ts";
import type { FileContent } from "#/models/fileContent.ts";
import { showToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { autoSave } from "#/signals/preferences.ts";
import { formatDateTime, formatRelativeTime } from "#/utils/format.ts";
import { META_KEY } from "#/utils/platform.ts";

interface VersionPickerProps {
  file: FileContent;
}

function useFileLoading(file: FileContent): boolean {
  const booting = useBooting();
  return file.loading.value || file.state.value === null || booting.value;
}

function SaveStatus({ file }: { file: FileContent }) {
  useTick(30_000);
  const pending = useFileLoading(file);
  const { saving, saveError, dirty, draft, version } = file;

  const savedAt = pending
    ? undefined
    : (draft.value?.timestamp ?? version.value?.timestamp);

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

export default function VersionPicker({ file }: VersionPickerProps) {
  const { fileTrees, selected, fileVersions, writable } = useEditorModels();
  const versions = fileVersions.current.value;
  const selection = selected.value;
  const versionId = selection?.versionId ?? null;
  const list = sortBy(
    versions?.versions.value ?? [],
    (version) => version.timestamp,
    {
      order: "desc",
    },
  );
  const selectedVersion = versions?.byId(versionId);
  const pending = useFileLoading(file);
  const active = file.saving.value || pending;

  const promotable =
    writable.value && (file.draft.value !== null || file.dirty.value);

  async function promoteDraft(close: () => void): Promise<void> {
    close();
    try {
      await file.save();
      await file.promote();
      void fileTrees.current.value?.load();
      void versions?.load();
    } catch {
      showToast("Promote failed", "error");
    }
  }

  return (
    <Dropdown
      // TODO -- the version history tooltip needs a rework
      triggerClass="btn relative w-52 whitespace-nowrap"
      trigger={
        <>
          <WaveBars fill amplitude={active ? 0.5 : 0} class="text-ink" />
          <Swappable
            swapKey={writable.value ? "latest" : "pinned"}
            class="swap-shift self-start"
          >
            {!writable.value && selectedVersion ? (
              <VersionChip timestamp={selectedVersion.timestamp} lock />
            ) : (
              <SaveStatus file={file} />
            )}
          </Swappable>
          {!pending && <ChevronDown size={14} class="rotate-on-open" />}
        </>
      }
    >
      {(close) => (
        <DropdownMenu class="dropdown-menu--full">
          {import.meta.env.DEV && promotable ? (
            <>
              <DropdownItem onClick={() => void promoteDraft(close)}>
                Promote draft
              </DropdownItem>
              <div class="separator" />
            </>
          ) : null}
          {list.map((version) => (
            <DropdownItem
              key={version.version_id}
              selected={version.version_id === versionId}
              onClick={() => {
                fileTrees.current.value?.selectVersion(version.version_id);
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
