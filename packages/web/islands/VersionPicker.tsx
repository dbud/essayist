import { ChevronDown, History } from "lucide-preact";
import Dropdown, {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/Dropdown.tsx";
import SaveStatus from "@/islands/SaveStatus.tsx";
import type { FileKey } from "@/signals/file.ts";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { getVersionHistory } from "@/signals/versionHistory.ts";
import { formatDateTime, formatRelativeTime } from "@/utils/format.ts";

type VersionPickerProps = FileKey;

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

  function select(next: string | null) {
    getFileTreeFor(wsId).selectVersion(next);
  }

  return (
    <Dropdown
      tooltip="Version history"
      triggerClass="cell cell--data relative w-52 whitespace-nowrap"
      trigger={
        <>
          {viewed ? (
            <>
              <History size={14} class="text-ink" />
              <span class="flex flex-col items-start leading-none">
                <span>Version view</span>
                <span class="text-[0.7rem] text-ink/50">
                  {formatDateTime(viewed.timestamp)}
                </span>
              </span>
            </>
          ) : (
            <SaveStatus wsId={wsId} path={path} />
          )}
          <ChevronDown size={14} class="rotate-on-open" />
        </>
      }
    >
      {(close) => (
        <DropdownMenu>
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
              {formatRelativeTime(version.timestamp)}
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
