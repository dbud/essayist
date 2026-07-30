import { ChevronDown } from "lucide-preact";
import Dropdown from "@/components/Dropdown.tsx";
import MenuItem from "@/components/MenuItem.tsx";
import MenuList from "@/components/MenuList.tsx";
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
        <MenuList>
          {OPTIONS.map((o) => (
            <MenuItem
              key={o.value}
              selected={o.value === viewerFont.value}
              onClick={() => {
                viewerFont.value = o.value;
                close();
              }}
            >
              <span class={o.value}>Aa&nbsp;{o.label}</span>
            </MenuItem>
          ))}
        </MenuList>
      )}
    </Dropdown>
  );
}
