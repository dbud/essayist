import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-preact";
import { leftSidebarOpened, rightSidebarOpened } from "@/signals/sidebar.ts";

interface SidebarToggleProps {
  side: "left" | "right";
  label: string;
}

export default function SidebarToggle({ side, label }: SidebarToggleProps) {
  const opened = side === "left" ? leftSidebarOpened : rightSidebarOpened;
  const isOpen = opened.value;
  const Icon =
    side === "left"
      ? isOpen
        ? PanelLeftClose
        : PanelLeftOpen
      : isOpen
        ? PanelRightClose
        : PanelRightOpen;

  return (
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-square"
      onClick={() => (opened.value = !opened.value)}
      aria-label={label}
      title={label}
    >
      <Icon size={18} />
    </button>
  );
}
