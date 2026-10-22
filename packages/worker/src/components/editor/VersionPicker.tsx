import { sortBy } from "@std/collections";
import { ChevronDown, CircleDashed } from "lucide-preact";
// TODO -- the pinned version shows a lock -- ESS-84
// import { LockKeyhole } from "lucide-preact";
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
import { useEditorModels } from "#/pages/editor/models.ts";
import { formatDateTime, formatRelativeTime } from "#/utils/format.ts";
import { META_KEY } from "#/utils/platform.ts";

interface VersionPickerProps {
  file: FileContent;
  // TODO -- the pinned version joins the picker -- ESS-84
  // versionId: string | null;
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
      // TODO -- ESS-84: the file model does not autosave yet
      label = (
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
  // TODO -- the pinned version shows a lock -- ESS-84
  // lock,
}: {
  timestamp: number;
  // lock?: boolean;
}) {
  return (
    <span class="inline-flex items-start gap-1">
      {/* TODO -- the pinned version shows a lock -- ESS-84 */}
      {/* {lock && <LockKeyhole size={14} />} */}
      <span class="leading-none">{formatDateTime(timestamp)}</span>
    </span>
  );
}

export default function VersionPicker({ file }: VersionPickerProps) {
  // TODO -- picking a version pins it on the tree -- ESS-84
  // const { fileTrees, fileVersions } = useEditorModels();
  const { fileVersions } = useEditorModels();
  const versions = fileVersions.current.value?.versions.value ?? [];
  const list = sortBy(versions, (version) => version.timestamp, {
    order: "desc",
  });
  // TODO -- the pinned version is the selected one -- ESS-84
  // const selected = list.find((version) => version.version_id === versionId);
  const pending = useFileLoading(file);
  const active = file.saving.value || pending;

  // TODO -- picking a version pins it on the tree -- ESS-84
  // function select(next: string | null) {
  //   fileTrees.current.value?.selectVersion(next);
  // }

  return (
    <Dropdown
      // TODO -- the version history tooltip needs a rework
      triggerClass="btn relative w-52 whitespace-nowrap"
      trigger={
        <>
          <WaveBars fill amplitude={active ? 0.5 : 0} class="text-ink" />
          {/* TODO -- the pinned version shows its timestamp instead of the
          save status -- ESS-84
          <Swappable swapKey={versionId ?? "latest"} class="swap-shift self-start">
            {selected ? (
              <VersionChip timestamp={selected.timestamp} lock />
            ) : (
              <SaveStatus file={file} />
            )}
          </Swappable>
          */}
          <Swappable swapKey="latest" class="swap-shift self-start">
            <SaveStatus file={file} />
          </Swappable>
          {!pending && <ChevronDown size={14} class="rotate-on-open" />}
        </>
      }
    >
      {() => (
        <DropdownMenu class="dropdown-menu--full">
          {/* TODO -- picking a version pins it -- ESS-84
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
          */}
          <DropdownItem selected>Latest</DropdownItem>
          {list.map((version) => (
            <DropdownItem key={version.version_id}>
              <VersionChip timestamp={version.timestamp} />
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
