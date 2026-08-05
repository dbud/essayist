import type { ComponentChildren } from "preact";

export interface SidebarProps {
  /** Drives the width animation, content entrance, and stagger cascade. */
  open: boolean;
  /** CSS length. Single source of truth for the width animation. */
  width?: string;
  /** Extra classes on the aside (e.g. background/text color). */
  class?: string;
  children: ComponentChildren;
}

/** Collapsible sidebar. Animates width 0 to `width`; clips content during the
 *  animation so it doesn't reflow; carries its own content entrance motion.
 *  Mark a descendant with [data-stagger-children] to cascade children in on
 *  open (see motion.css). */
export default function Sidebar({
  open,
  width = "18rem",
  class: className,
  children,
}: SidebarProps) {
  const state = open ? "is-open" : "is-closed";
  return (
    <aside
      class={`pane pane--sidebar ${state} shrink-0 ${className ?? ""}`}
      style={{ "--pane-size": width }}
    >
      <div class="pane-clip">
        <div class={`pane-content ${state} h-full overflow-y-auto`}>
          {children}
        </div>
      </div>
    </aside>
  );
}
