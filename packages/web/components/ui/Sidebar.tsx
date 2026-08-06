import type { ComponentChildren } from "preact";
import { usePaneClip } from "@/hooks/usePaneClip.ts";

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
  const { clipRef, onTransitionEnd } = usePaneClip(
    open,
    "grid-template-columns",
  );
  const state = open ? "is-open" : "is-closed";
  return (
    <aside
      class={`pane pane--sidebar ${state} ${className}`}
      onTransitionEnd={onTransitionEnd}
    >
      <div class="pane-clip" ref={clipRef}>
        <div class="pane-content h-full overflow-y-auto">{children}</div>
      </div>
    </aside>
  );
}
