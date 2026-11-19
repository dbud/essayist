import { useModel, useSignal } from "@preact/signals";
import { assertExists, unreachable } from "@std/assert";
import { ChevronDown } from "lucide-preact";

import AqSwap from "#/components/ui/AqSwap.tsx";
import { useClickOutside } from "#/hooks/useClickOutside.ts";
import { FileStatsModel } from "#/models/fileStats.ts";
import { type FileStatSection, usePreferences } from "#/models/preferences.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { formatCount } from "#/utils/format.ts";

const STAT_OPTIONS: { value: FileStatSection; label: string }[] = [
  { value: "words", label: "Words" },
  { value: "chars", label: "Characters (no spaces)" },
  { value: "charsWithSpaces", label: "Characters (with spaces)" },
];

export default function FileStats() {
  const file = useEditorModels().fileContents.current.value;
  assertExists(file, "FileStats mounts only with a file");
  const stats = useModel(() => new FileStatsModel(file));
  const { fileStatsSections } = usePreferences();
  const enabled = fileStatsSections.value;
  const open = useSignal(false);
  const close = () => (open.value = false);
  const ref = useClickOutside(open.value ? close : undefined);

  if (file.state.value === null) return null;

  function statValue(section: FileStatSection): string {
    switch (section) {
      case "words":
        return formatCount(stats.wordCount.value, "word");
      case "chars":
        return formatCount(stats.charCount.value, "char");
      case "charsWithSpaces":
        return formatCount(stats.charCountWithSpaces.value, "char w/ space", "chars w/ spaces");
      default:
        unreachable("statValue: unknown stat section");
    }
  }

  function toggleSection(section: FileStatSection) {
    fileStatsSections.value = enabled.includes(section)
      ? enabled.filter((s) => s !== section)
      : [...enabled, section];
  }

  const rows = STAT_OPTIONS.filter((opt) => enabled.includes(opt.value));

  return (
    <div class="aq-melt inline-flex pointer-events-auto" ref={ref}>
      <AqSwap on={enabled.join(",")}>
        <button
          type="button"
          class="aq-btn aq-btn--idle items-center text-xs"
          aria-expanded={open.value}
          onClick={() => (open.value = !open.value)}
        >
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
          <ChevronDown class="aq-chevron" data-static />
        </button>
      </AqSwap>
      <div class={"aq-dropdown--origin-end aq-dropdown--up" + (open.value ? " is-open" : "")}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {STAT_OPTIONS.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled.includes(opt.value)}
                  class={`aq-menu-btn aq-toggle-row ${enabled.includes(opt.value) ? "is-on" : ""}`}
                  onClick={() => toggleSection(opt.value)}
                >
                  <span>{opt.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
