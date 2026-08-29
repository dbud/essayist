import type { ComponentChildren } from "preact";

/** Ruled card row: muted label cell + single-line value cell. */
export function Field({
  label,
  value,
}: {
  label: string;
  value: ComponentChildren;
}) {
  return (
    <>
      <div class="cell--data text-ink/60">{label}</div>
      <div class="cell--data min-w-0 break-words">{value}</div>
    </>
  );
}

/** Label with the items stacked as vertical lines; hidden when empty. */
export function List({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <div class="cell--data text-ink/60">{label}</div>
      <div class="cell--data flex-col min-w-0 break-words">
        {items.map((item) => (
          <div>{item}</div>
        ))}
      </div>
    </>
  );
}
