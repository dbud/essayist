import {
  ChevronDown,
  CodeXml,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
} from "lucide-preact";
import type { ComponentChild } from "preact";
import Dropdown, {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/Dropdown.tsx";
import Swappable from "@/components/ui/Swappable.tsx";
import type { BlockType } from "@/editor/blockFormat.ts";

interface BlockOption {
  value: BlockType;
  label: string;
  icon: ComponentChild;
}

const OPTIONS: BlockOption[] = [
  { value: "normal", label: "Paragraph", icon: <Pilcrow size={14} /> },
  { value: "h1", label: "Heading 1", icon: <Heading1 size={14} /> },
  { value: "h2", label: "Heading 2", icon: <Heading2 size={14} /> },
  { value: "h3", label: "Heading 3", icon: <Heading3 size={14} /> },
  { value: "quote", label: "Quote", icon: <Quote size={14} /> },
  { value: "bullet", label: "Bullet list", icon: <List size={14} /> },
  { value: "number", label: "Numbered list", icon: <ListOrdered size={14} /> },
  { value: "code", label: "Code block", icon: <CodeXml size={14} /> },
];

interface BlockTypeSelectProps {
  block: BlockType;
  onChange: (type: BlockType) => void;
}

export default function BlockTypeSelect({
  block,
  onChange,
}: BlockTypeSelectProps) {
  const current = OPTIONS.find((o) => o.value === block) ?? OPTIONS[0];

  return (
    <Dropdown
      tooltip="Paragraph style"
      triggerClass="btn @sm:w-36"
      trigger={
        <>
          <Swappable swapKey={current.value} class="swap-rotate">
            {current.icon}
          </Swappable>
          <span class="hidden @sm:inline">
            <Swappable swapKey={current.value} class="swap-shift">
              {current.label}
            </Swappable>
          </span>
          <ChevronDown size={14} class="rotate-on-open" />
        </>
      }
    >
      {(close) => (
        <DropdownMenu>
          {OPTIONS.map((o) => (
            <DropdownItem
              key={o.value}
              selected={o.value === block}
              onClick={() => {
                onChange(o.value);
                close();
              }}
            >
              {o.icon}
              <span>{o.label}</span>
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
