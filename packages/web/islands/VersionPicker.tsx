import { ChevronDown, History } from "lucide-preact";
import Dropdown, {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/Dropdown.tsx";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { getVersionHistory } from "@/signals/versionHistory.ts";
import { formatRelativeTime } from "@/utils/format.ts";

interface VersionPickerProps {
  wsId: string;
  path: string;
  versionId?: string;
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

  function select(next: string | null) {
    getFileTreeFor(wsId).selectVersion(next);
  }

  return (
    <Dropdown
      tooltip="Version history"
      triggerClass="btn"
      trigger={
        <>
          <History size={14} class="shrink-0" />
          <span class="hidden @sm:inline">
            {viewed ? formatRelativeTime(viewed.timestamp) : "Latest"}
          </span>
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
