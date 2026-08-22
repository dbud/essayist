import type { User } from "@essayist/core";
import { PanelRightClose, PanelRightOpen } from "lucide-preact";
import type { ComponentChildren } from "preact";
import Panel from "@/components/ui/Panel.tsx";
import SettingsMenu from "@/islands/SettingsMenu.tsx";
import { navigationOpened, rightSidebarOpened } from "@/signals/sidebar.ts";

interface NavigationProps {
  user?: User;
  children: ComponentChildren;
}

function RightSidebarToggle() {
  return (
    <button
      type="button"
      class="btn"
      aria-label={rightSidebarOpened.value ? "Hide sidebar" : "Show sidebar"}
      aria-pressed={rightSidebarOpened.value}
      onClick={() => (rightSidebarOpened.value = !rightSidebarOpened.value)}
    >
      {rightSidebarOpened.value ? (
        <PanelRightClose size={16} />
      ) : (
        <PanelRightOpen size={16} />
      )}
    </button>
  );
}

export default function Navigation({ user, children }: NavigationProps) {
  return (
    <Panel
      class="bg-surface shadow-md"
      onClickOutside={() => (navigationOpened.value = false)}
    >
      <div class="content-layout content-layout--side">
        <div class="content-main flex items-center">{children}</div>
        <div class="flex items-start justify-end">
          <div class="flex stack stack--row">
            {user && <SettingsMenu user={user} />}
            <RightSidebarToggle />
          </div>
        </div>
      </div>
    </Panel>
  );
}
