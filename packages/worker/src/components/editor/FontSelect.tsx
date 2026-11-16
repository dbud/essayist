import { useSignal } from "@preact/signals";
import { ChevronDown } from "lucide-preact";

import Swappable from "#/components/ui/Swappable.tsx";
import { useClickOutside } from "#/hooks/useClickOutside.ts";
import { usePreferences } from "#/models/preferences.ts";

const OPTIONS = [
  { value: "font-serif", label: "Serif" },
  { value: "font-sans", label: "Sans" },
  { value: "font-mono", label: "Mono" },
] as const;

export default function FontSelect() {
  const { viewerFont } = usePreferences();
  const open = useSignal(false);
  const close = () => (open.value = false);
  const ref = useClickOutside(open.value ? close : undefined);
  const current = OPTIONS.find((o) => o.value === viewerFont.value) ?? OPTIONS[0];

  return (
    <div class="aq-melt inline-flex" ref={ref}>
      <button
        type="button"
        class="aq-btn"
        aria-expanded={open.value}
        data-tooltip="Reading font"
        onClick={() => (open.value = !open.value)}
      >
        <Swappable swapKey={current.value} class="swap-shift" fluid>
          <span class="inline-flex gap-1">
            <span>Aa</span>
            <span class="hidden @sm:inline">{current.label}</span>
          </span>
        </Swappable>
        <ChevronDown class="aq-chevron" />
      </button>
      <div class={`aq-dropdown ${open.value ? "is-open" : ""}`}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {OPTIONS.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  class={`aq-menu-btn ${o.value === viewerFont.value ? "is-selected" : ""}`}
                  onClick={() => {
                    viewerFont.value = o.value;
                    close();
                  }}
                >
                  <span class={o.value}>Aa</span>
                  <span class={o.value}>{o.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
