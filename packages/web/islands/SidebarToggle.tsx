import { PanelLeftClose, PanelLeftOpen } from "lucide-preact";
import { useSmallScreen } from "@/hooks/useSmallScreen.ts";
import { sidebarCollapsed, sidebarOverlayOpen } from "@/signals/sidebar.ts";

export default function SidebarToggle() {
  const isSmallScreen = useSmallScreen();

  const columnVisible = !isSmallScreen.value && !sidebarCollapsed.value;
  const opened =
    columnVisible || (isSmallScreen.value && sidebarOverlayOpen.value);

  function toggle() {
    if (columnVisible) {
      sidebarCollapsed.value = true;
    } else if (isSmallScreen.value) {
      sidebarOverlayOpen.value = !sidebarOverlayOpen.value;
    } else {
      sidebarCollapsed.value = false;
    }
  }

  return (
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-square"
      onClick={toggle}
      aria-label={opened ? "Hide file browser" : "Show file browser"}
      title={opened ? "Hide file browser" : "Show file browser"}
    >
      {opened ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
    </button>
  );
}
