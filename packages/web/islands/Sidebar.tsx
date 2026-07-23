import { IS_BROWSER } from "fresh/runtime";
import type { ComponentChildren } from "preact";
import {
  leftSidebarCollapsed,
  rightSidebarCollapsed,
} from "@/signals/sidebar.ts";

interface SidebarProps {
  side: "left" | "right";
  className?: string;
  children: ComponentChildren;
}

export default function Sidebar({
  side,
  className = "w-64 py-2",
  children,
}: SidebarProps) {
  const collapsed =
    side === "left" ? leftSidebarCollapsed : rightSidebarCollapsed;
  const hidden = collapsed.value || !IS_BROWSER;

  return (
    <aside
      class={`shrink-0 min-h-0 overflow-y-auto ${className} ${
        hidden ? "hidden" : ""
      }`}
    >
      {children}
    </aside>
  );
}
