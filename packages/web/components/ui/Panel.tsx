import type { ComponentChildren } from "preact";

export interface PanelProps {
  open: boolean;
  height?: string;
  class?: string;
  children: ComponentChildren;
}

/** Collapsible horizontal panel. Animates height 0 to `height`;
 *  clips content during the animation so it doesn't reflow;
 *  carries its own content entrance motion. */
export default function Panel({
  open,
  height = "10rem",
  class: className,
  children,
}: PanelProps) {
  const state = open ? "is-open" : "is-closed";
  return (
    <div
      class={`pane pane--panel ${state} shrink-0 ${className ?? ""}`}
      style={{ "--pane-size": height }}
    >
      <div class="pane-clip">
        <div class={`pane-content ${state}`}>{children}</div>
      </div>
    </div>
  );
}
