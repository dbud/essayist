import type { ComponentChildren } from "preact";

import type { UserData } from "#/state.ts";

interface NavigationProps {
  user?: UserData;
  children: ComponentChildren;
}

export default function Navigation({ children }: NavigationProps) {
  return (
    <div class="relative z-panel shrink-0 bg-surface shadow-md">
      <div class="content-layout content-layout--side relative">
        <div class="content-main flex flex-col items-start">{children}</div>
      </div>
    </div>
  );
}
