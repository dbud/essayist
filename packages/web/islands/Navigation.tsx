import type { User } from "@essayist/core";
import type { ComponentChildren } from "preact";
import EssayistLogo from "@/components/ui/EssayistLogo.tsx";
import SettingsMenu from "@/islands/SettingsMenu.tsx";
import ThemeToggle from "@/islands/ThemeToggle.tsx";

interface NavigationProps {
  user?: User;
  children: ComponentChildren;
}

export default function Navigation({ user, children }: NavigationProps) {
  return (
    <div class="relative z-panel shrink-0 bg-surface shadow-md">
      <EssayistLogo class="absolute left-0 top-[-1px] h-[calc(2.5rem+1px)] w-5 items-start @[64rem]:w-10" />
      <div class="content-layout content-layout--side">
        <div class="content-main flex flex-col items-start">{children}</div>
        <div class="content-side flex items-center justify-end">
          <div class="flex w-fit stack stack--row">
            <ThemeToggle />
            {user && <SettingsMenu user={user} />}
          </div>
        </div>
      </div>
    </div>
  );
}
