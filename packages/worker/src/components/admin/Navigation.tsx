import type { User } from "@essayist/core";
import type { ComponentChildren } from "preact";

interface NavigationProps {
  user?: User;
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
