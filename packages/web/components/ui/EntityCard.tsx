import type { LucideIcon } from "lucide-preact";
import { Plus } from "lucide-preact";
import type { ComponentChildren } from "preact";

/** Entity card: toolbar-style header row (title, optional mono id, action
 *  rail) above a ruled label/value grid. */
export function EntityCard({
  title,
  id,
  actions,
  children,
}: {
  title: ComponentChildren;
  id?: string;
  actions: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <div class="flex flex-col stack stack--col">
      <div class="flex stack stack--row shadow-md z-toolbar">
        <div class="cell min-w-0 flex-1 gap-2">
          {title}
          {id && <span class="ml-auto text-ink/40 font-mono">id: {id}</span>}
        </div>
        <div class="flex shrink-0 stack">{actions}</div>
      </div>
      <div class="grid grid-cols-[auto_1fr] stack stack--row">{children}</div>
    </div>
  );
}

/** Icon-only header action with tooltip label. */
export function ActionBtn({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class="btn"
      data-tooltip={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={14} />
    </button>
  );
}

/** Accent "New <entity>" trigger wrapped in a ruled row. */
export function NewButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <div class="flex stack stack--row">
      <button type="button" class="btn cell--accent" onClick={onClick}>
        <Plus size={16} />
        {label}
      </button>
    </div>
  );
}
