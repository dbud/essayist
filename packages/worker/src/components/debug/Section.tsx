import { toKebabCase } from "@std/text/to-kebab-case";
import { ChevronDown } from "lucide-preact";
import type { ComponentChildren } from "preact";

import AqCollapse from "#/components/ui/Collapsible.tsx";
import Melt from "#/components/ui/Melt.tsx";
import { usePersistentSignal } from "#/utils/persistentSignal.ts";

interface SectionProps {
  title: string;
  children: ComponentChildren;
  defaultOpen?: boolean;
}

export default function Section({ title, children, defaultOpen = true }: SectionProps) {
  const open = usePersistentSignal(`section:${toKebabCase(title)}`, defaultOpen);

  return (
    <Melt>
      <div class="menu">
        <button
          type="button"
          class="menu-btn justify-between"
          onClick={() => (open.value = !open.value)}
          aria-expanded={open.value}
        >
          {title}
          <ChevronDown class="chevron" />
        </button>
        <AqCollapse open={open.value} fade>
          <div class="pt-2">{children}</div>
        </AqCollapse>
      </div>
    </Melt>
  );
}
