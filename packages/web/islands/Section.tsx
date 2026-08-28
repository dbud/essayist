import { toKebabCase } from "@std/text/to-kebab-case";
import { ChevronDown } from "lucide-preact";
import type { ComponentChildren } from "preact";
import Panel from "@/components/ui/Panel.tsx";
import { usePersistentSignal } from "@/utils/persistentSignal.ts";

interface SectionProps {
  title: string;
  children: ComponentChildren;
  defaultOpen?: boolean;
}

export default function Section({
  title,
  children,
  defaultOpen = true,
}: SectionProps) {
  const open = usePersistentSignal(
    `section:${toKebabCase(title)}`,
    defaultOpen,
  );

  return (
    <div class="flex flex-col">
      <button
        type="button"
        class="btn cell--ink"
        onClick={() => (open.value = !open.value)}
        aria-expanded={open.value}
      >
        {title}
        <ChevronDown
          size={16}
          class={`transition-transform duration-150 ${
            open.value ? "" : "-rotate-90"
          }`}
        />
      </button>
      <Panel open={open.value} class="bg-surface">
        {children}
      </Panel>
    </div>
  );
}
