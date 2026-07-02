import { ChevronDown } from "lucide-preact";
import Dropdown from "@/components/Dropdown.tsx";
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
      buttonClass="btn btn-sm btn-ghost gap-2"
      button={
        <>
          <span class={current.value}>Aa&nbsp;{current.label}</span>
          <ChevronDown size={14} />
        </>
      }
    >
      {(close) => (
        <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-40 p-2 shadow-sm">
          {OPTIONS.map((o) => (
            <li>
              <button
                type="button"
                class={`gap-2 ${
                  o.value === viewerFont.value
                    ? "bg-primary/10 text-primary rounded"
                    : ""
                }`}
                onClick={() => {
                  viewerFont.value = o.value;
                  close();
                }}
              >
                <span class={o.value}>Aa&nbsp;{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dropdown>
  );
}
