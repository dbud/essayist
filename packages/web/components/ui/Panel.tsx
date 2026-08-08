import type { ComponentChildren } from "preact";
import { useClickOutside } from "@/hooks/useClickOutside.ts";
import { usePaneClip } from "@/hooks/usePaneClip.ts";

export interface PanelProps {
  open: boolean;
  class?: string;
  /** Called when a click lands outside the panel. */
  onClickOutside?: () => void;
  /** Called when the clip transition settles (after overflow is toggled). */
  onSettled?: () => void;
  children: ComponentChildren;
}

/** Collapsible panel pane. See pane.css for animation details. */
export default function Panel({
  open,
  class: className = "",
  onClickOutside,
  onSettled,
  children,
}: PanelProps) {
  const { clipRef, onTransitionEnd } = usePaneClip(
    open,
    "grid-template-rows",
    onSettled,
  );
  const outsideRef = useClickOutside(onClickOutside);
  const state = open ? "is-open" : "is-closed";
  return (
    <div
      class={`pane pane--panel ${state} ${className}`}
      onTransitionEnd={onTransitionEnd}
    >
      <div class="pane-clip" ref={clipRef}>
        <div class="pane-content" ref={outsideRef}>
          {children}
        </div>
      </div>
    </div>
  );
}
