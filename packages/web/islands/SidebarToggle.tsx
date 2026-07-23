import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-preact";
import {
  leftSidebarCollapsed,
  rightSidebarCollapsed,
} from "@/signals/sidebar.ts";

interface SidebarToggleProps {
  side: "left" | "right";
  label: string;
}

export default function SidebarToggle({ side, label }: SidebarToggleProps) {
  const collapsed =
    side === "left" ? leftSidebarCollapsed : rightSidebarCollapsed;
  const isOpen = !collapsed.value;
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
      onClick={() => (collapsed.value = !collapsed.value)}
      aria-label={label}
      title={label}
    >
      <Icon size={18} />
    </button>
  );
}
