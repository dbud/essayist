import type { User } from "@essayist/core";
import type { ComponentChildren } from "preact";
import Panel from "@/components/ui/Panel.tsx";
import SettingsMenu from "@/islands/SettingsMenu.tsx";
import { navigationOpened } from "@/signals/sidebar.ts";

interface NavigationProps {
  user?: User;
  children: ComponentChildren;
}

export default function Navigation({ user, children }: NavigationProps) {
  return (
    <Panel
      class="bg-pane text-pane-content"
      onClickOutside={() => (navigationOpened.value = false)}
    >
      <div class="content-layout content-layout--side">
        <div class="content-main flex items-center">{children}</div>
        <div class="content-side flex items-start justify-end my-2">
          {user && <SettingsMenu user={user} />}
        </div>
      </div>
    </Panel>
  );
}
