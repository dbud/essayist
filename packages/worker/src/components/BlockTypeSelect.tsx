import { useSignal } from "@preact/signals";
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

import Melt from "#/components/ui/Melt.tsx";
import Swap from "#/components/ui/Swap.tsx";
import { type BlockType } from "#/editor/blockFormat.ts";
import { useClickOutside } from "#/hooks/useClickOutside.ts";

interface BlockOption {
  value: BlockType;
  label: string;
  icon: ComponentChild;
}

const OPTIONS: BlockOption[] = [
  { value: "normal", label: "Paragraph", icon: <Pilcrow /> },
  { value: "h1", label: "Heading 1", icon: <Heading1 /> },
  { value: "h2", label: "Heading 2", icon: <Heading2 /> },
  { value: "h3", label: "Heading 3", icon: <Heading3 /> },
  { value: "quote", label: "Quote", icon: <Quote /> },
  { value: "bullet", label: "Bullet list", icon: <List /> },
  { value: "number", label: "Numbered list", icon: <ListOrdered /> },
  { value: "code", label: "Code block", icon: <CodeXml /> },
];

interface BlockTypeSelectProps {
  block: BlockType;
  onChange: (type: BlockType) => void;
  disabled?: boolean;
}

export default function BlockTypeSelect({ block, onChange, disabled }: BlockTypeSelectProps) {
  const open = useSignal(false);
  const close = () => (open.value = false);
  const ref = useClickOutside(open.value && !disabled ? close : undefined);
  const current = OPTIONS.find((o) => o.value === block) ?? OPTIONS[0];

  return (
    <Melt ref={ref}>
      <Swap on={current.value}>
        <button
          type="button"
          class="btn--solid btn--small"
          aria-expanded={open.value}
          data-tooltip="Paragraph style"
          disabled={disabled}
          onClick={() => (open.value = !open.value)}
        >
          <span class="swap-rotate">{current.icon}</span>
          <span class="hidden @sm:inline">{current.label}</span>
          <ChevronDown class="chevron" data-static />
        </button>
      </Swap>
      <div class={`dropdown dropdown--origin-start ${open.value ? "is-open" : ""}`}>
        <div class="menu menu--small">
          <ul class="menu-rows" data-stagger>
            {OPTIONS.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  class={`menu-btn ${o.value === block ? "is-selected" : ""}`}
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
        </div>
      </div>
    </Melt>
  );
}
