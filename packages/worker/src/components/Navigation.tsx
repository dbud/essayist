import type { User } from "@essayist/core";
import type { ComponentChildren } from "preact";

// import EssayistLogo from "#/components/logo/EssayistLogo.tsx";
import SettingsMenu from "#/components/settings/SettingsMenu.tsx";
import ThemeToggle from "#/components/ThemeToggle.tsx";

interface NavigationProps {
  user?: User;
  children?: ComponentChildren;
}

export default function Navigation({ user, children }: NavigationProps) {
  return (
    <div class="relative z-panel flex py-4 bg-surface">
      <div class="content-layout content-layout--side relative">
        {/*<EssayistLogo class="absolute left-0 top-[-1px] h-[calc(2.5rem+1px)] w-5 items-start @[64rem]:w-10" />*/}
        <div class="content-main flex flex-col items-start">{children}</div>
        <div class="content-side flex items-center justify-end">
          <div class="flex gap-4">
            <ThemeToggle />
            {user && <SettingsMenu user={user} />}
          </div>
        </div>
      </div>
    </div>
  );
}
