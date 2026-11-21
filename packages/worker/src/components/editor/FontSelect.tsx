import { useSignal } from "@preact/signals";
import { ChevronDown } from "lucide-preact";

import AqSwap from "#/components/ui/AqSwap.tsx";
import Melt from "#/components/ui/Melt.tsx";
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
    <Melt class="inline-flex" ref={ref}>
      <AqSwap on={current.value}>
        <button
          type="button"
          class="aq-btn aq-btn--idle"
          aria-expanded={open.value}
          data-tooltip="Reading font"
          onClick={() => (open.value = !open.value)}
        >
          <span class="inline-flex gap-1">
            <span class={current.value}>Aa</span>
          </span>
          <ChevronDown class="aq-chevron" data-static />
        </button>
      </AqSwap>
      <div class={`aq-dropdown aq-dropdown--origin-start ${open.value ? "is-open" : ""}`}>
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
    </Melt>
  );
}
