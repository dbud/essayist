import { ChevronDown, LockKeyhole } from "lucide-preact";
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
      // tooltip="Version history" TODO -- rework tooltip
      triggerClass="cell cell--data relative w-52 whitespace-nowrap"
      trigger={
        <>
          {viewed ? (
            <>
              <LockKeyhole size={14} />
              <span class="flex flex-col items-start leading-none">
                {formatDateTime(viewed.timestamp)}
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
              <div class="flex flex-col items-start">
                <span>{formatDateTime(version.timestamp)}</span>
                <span class="text-[0.7rem] opacity-70">
                  {formatRelativeTime(version.timestamp)}
                </span>
              </div>
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
