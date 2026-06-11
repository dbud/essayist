import type { ComponentChildren } from "preact";
import { useSignal } from "@preact/signals";

interface SectionProps {
  title: string;
  children: ComponentChildren;
  defaultOpen?: boolean;
}

export default function Section(
  { title, children, defaultOpen = true }: SectionProps,
) {
  const open = useSignal(defaultOpen);

  return (
    <details
      class="collapse collapse-arrow join-item border border-base-300 bg-base-100"
      open={open.value}
    >
      <summary
        class="collapse-title font-semibold text-sm flex items-center gap-2 cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          open.value = !open.value;
        }}
      >
        {title}
      </summary>
      <div class="collapse-content">{children}</div>
    </details>
  );
}
