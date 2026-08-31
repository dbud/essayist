import type { User } from "@essayist/core";
import type { ComponentChildren } from "preact";
import EssayistLogo from "@/components/ui/EssayistLogo.tsx";
import Panel from "@/components/ui/Panel.tsx";
import SettingsMenu from "@/islands/SettingsMenu.tsx";

interface NavigationProps {
  user?: User;
  children: ComponentChildren;
}

export default function Navigation({ user, children }: NavigationProps) {
  return (
    <Panel class="bg-surface shadow-md">
      <EssayistLogo class="absolute top-0 left-0 h-10 w-5 items-start @[64rem]:w-10" />
      <div class="content-layout content-layout--side">
        <div class="content-main flex flex-col items-start">{children}</div>
        <div class="content-side flex items-center justify-end">
          <div class="flex w-fit stack stack--row">
            {user && <SettingsMenu user={user} />}
          </div>
        </div>
      </div>
    </Panel>
  );
}
