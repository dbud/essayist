import type { ComponentChildren } from "preact";
import { useSmallScreen } from "@/hooks/useSmallScreen.ts";
import { sidebarCollapsed, sidebarOverlayOpen } from "@/signals/sidebar.ts";

export default function Sidebar({
  children,
  closeLabel,
}: {
  children: ComponentChildren;
  closeLabel: string;
}) {
  const isSmallScreen = useSmallScreen();

  const overlay = isSmallScreen.value;
  const open = overlay ? sidebarOverlayOpen.value : !sidebarCollapsed.value;

  const asideClass = overlay
    ? "fixed inset-y-0 left-0 z-50 w-64 pr-4 overflow-y-auto bg-base-200 shadow-xl"
    : "w-64 shrink-0 min-h-0 overflow-y-auto py-2";

  return (
    <>
      {overlay && open && (
        <button
          type="button"
          class="fixed inset-0 z-40 bg-black/40 cursor-default"
          aria-label={closeLabel}
          onClick={() => {
            sidebarOverlayOpen.value = false;
          }}
        />
      )}
      <aside class={`${asideClass} ${open ? "" : "hidden"}`}>{children}</aside>
    </>
  );
}
