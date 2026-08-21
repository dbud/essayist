import { ChevronDown } from "lucide-preact";
import Dropdown, {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/Dropdown.tsx";
import Swappable from "@/components/ui/Swappable.tsx";
import { viewerFont } from "@/signals/preferences.ts";

const OPTIONS = [
  { value: "font-serif", label: "Serif" },
  { value: "font-sans", label: "Sans" },
  { value: "font-mono", label: "Mono" },
] as const;

export default function FontSelect() {
  const current =
    OPTIONS.find((o) => o.value === viewerFont.value) ?? OPTIONS[0];

  return (
    <Dropdown
      trigger={
        <>
          <Swappable swapKey={current.value} class="swap-shift">
            <span class="inline-flex gap-1">
              <span>Aa</span>
              <span class="hidden @sm:inline">{current.label}</span>
            </span>
          </Swappable>
          <ChevronDown size={14} />
        </>
      }
    >
      {(close) => (
        <DropdownMenu>
          {OPTIONS.map((o) => (
            <DropdownItem
              key={o.value}
              selected={o.value === viewerFont.value}
              onClick={() => {
                viewerFont.value = o.value;
                close();
              }}
            >
              <span class={o.value}>Aa</span>
              <span class={o.value}>{o.label}</span>
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
