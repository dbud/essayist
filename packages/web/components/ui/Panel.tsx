import type { ComponentChildren } from "preact";

export interface PanelProps {
  open: boolean;
  class?: string;
  children: ComponentChildren;
}

/** Collapsible panel pane. See pane.css for animation details. */
export default function Panel({
  open,
  class: className = "",
  children,
}: PanelProps) {
  const state = open ? "is-open" : "is-closed";
  return (
    <div class={`pane pane--panel ${state} ${className}`}>
      <div class="pane-clip">
        <div class="pane-content">{children}</div>
      </div>
    </div>
  );
}
