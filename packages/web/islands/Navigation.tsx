import type { User } from "@essayist/core";
import type { ComponentChildren } from "preact";
import ContentLayout from "@/components/ui/ContentLayout.tsx";
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
      open
      class="bg-pane text-pane-content"
      onClickOutside={() => (navigationOpened.value = false)}
    >
      <ContentLayout withSidePane>
        {({ mainClass, sideClass }) => (
          <>
            <div class={`flex items-center ${mainClass}`}>{children}</div>
            <div class={`flex items-start justify-end my-2 ${sideClass}`}>
              {user && <SettingsMenu user={user} />}
            </div>
          </>
        )}
      </ContentLayout>
    </Panel>
  );
}
