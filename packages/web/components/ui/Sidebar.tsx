import type { ComponentChildren } from "preact";

export interface SidebarProps {
  open: boolean;
  class?: string;
  children: ComponentChildren;
}

/** Collapsible sidebar pane. See pane.css for animation details. */
export default function Sidebar({
  open,
  class: className = "",
  children,
}: SidebarProps) {
  const state = open ? "is-open" : "is-closed";
  return (
    <aside class={`pane pane--sidebar ${state} ${className}`}>
      <div class="pane-clip">
        <div class="pane-content h-full overflow-y-auto">{children}</div>
      </div>
    </aside>
  );
}
