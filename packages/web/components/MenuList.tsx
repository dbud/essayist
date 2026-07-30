import type { ComponentChildren } from "preact";

export default function MenuList({
  children,
}: {
  children: ComponentChildren;
}) {
  return (
    <ul class="dropdown-content menu bg-base-100 rounded-box z-1 min-w-48 p-2 gap-1 shadow-sm">
      {children}
    </ul>
  );
}
