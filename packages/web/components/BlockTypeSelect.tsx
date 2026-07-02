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
import type { VNode } from "preact";
import Dropdown from "@/components/Dropdown.tsx";
import type { BlockType } from "@/editor/blockFormat.ts";

interface BlockOption {
  value: BlockType;
  label: string;
  icon: VNode;
}

const OPTIONS: BlockOption[] = [
  { value: "normal", label: "Normal", icon: <Pilcrow size={16} /> },
  { value: "h1", label: "Heading 1", icon: <Heading1 size={16} /> },
  { value: "h2", label: "Heading 2", icon: <Heading2 size={16} /> },
  { value: "h3", label: "Heading 3", icon: <Heading3 size={16} /> },
  { value: "quote", label: "Quote", icon: <Quote size={16} /> },
  { value: "bullet", label: "Bullet list", icon: <List size={16} /> },
  { value: "number", label: "Numbered list", icon: <ListOrdered size={16} /> },
  { value: "code", label: "Code block", icon: <CodeXml size={16} /> },
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
      buttonClass="btn btn-sm btn-ghost gap-2"
      button={
        <>
          {current.icon}
          <span>{current.label}</span>
          <ChevronDown size={14} />
        </>
      }
    >
      {(close) => (
        <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-48 p-2 shadow-sm">
          {OPTIONS.map((o) => (
            <li>
              <button
                type="button"
                class={`gap-2 ${
                  o.value === block ? "bg-primary/10 text-primary rounded" : ""
                }`}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
              >
                {o.icon}
                <span>{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dropdown>
  );
}
