import type { ComponentChildren } from "preact";

interface ToolbarProps {
  children?: ComponentChildren;
}

export default function Toolbar({ children }: ToolbarProps) {
  return (
    <div class="flex items-center justify-between px-4 py-2 border-b border-base-300 bg-base-100 shadow-xs">
      {children}
    </div>
  );
}
