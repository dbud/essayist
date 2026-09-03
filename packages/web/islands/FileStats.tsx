import { ChevronDown } from "lucide-preact";
import Dropdown, {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/Dropdown.tsx";
import { CheckboxIcon } from "@/components/ui/icons.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { getFile } from "@/signals/file.ts";
import { getFileStats } from "@/signals/fileStats.ts";
import {
  type FileStatSection,
  fileStatsSections,
} from "@/signals/preferences.ts";
import { formatCount } from "@/utils/format.ts";

interface FileStatsProps {
  wsId: string;
  path: string;
}

const STAT_OPTIONS: { value: FileStatSection; label: string }[] = [
  { value: "words", label: "Words" },
  { value: "chars", label: "Characters (no spaces)" },
  { value: "charsWithSpaces", label: "Characters (with spaces)" },
];

export default function FileStats({ wsId, path }: FileStatsProps) {
  const { state, loading } = getFile(wsId, path);
  const stats = getFileStats(wsId, path);
  const ready = !loading.value && state.value !== null;
  const enabled = fileStatsSections.value;

  if (!ready) {
    return (
      <div class="flex cell cell--data relative min-w-42">
        <WaveBars fill amplitude={1} />
      </div>
    );
  }

  function statValue(section: FileStatSection): string {
    switch (section) {
      case "words":
        return formatCount(stats.wordCount.value, "word");
      case "chars":
        return formatCount(stats.charCount.value, "char");
      case "charsWithSpaces":
        return formatCount(
          stats.charCountWithSpaces.value,
          "char w/ space",
          "chars w/ spaces",
        );
    }
  }

  function toggleSection(section: FileStatSection) {
    fileStatsSections.value = enabled.includes(section)
      ? enabled.filter((s) => s !== section)
      : [...enabled, section];
  }

  const rows = STAT_OPTIONS.filter((opt) => enabled.includes(opt.value));

  return (
    <Dropdown
      triggerClass="btn items-start text-xs"
      trigger={
        <>
          {rows.length > 0 ? (
            <span class="flex flex-col items-start leading-none whitespace-nowrap text-[0.7rem]">
              {rows.map((opt) => (
                <span key={opt.value} title={opt.label}>
                  {statValue(opt.value)}
                </span>
              ))}
            </span>
          ) : (
            <span>Stats</span>
          )}
          <ChevronDown size={14} class="rotate-on-open" />
        </>
      }
    >
      {() => (
        <DropdownMenu>
          {STAT_OPTIONS.map((opt) => (
            <DropdownItem
              key={opt.value}
              onClick={() => toggleSection(opt.value)}
            >
              <CheckboxIcon selected={enabled.includes(opt.value)} size={15} />
              {opt.label}
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
