import type { MarkBadge } from "@/signals/sidenotes.ts";

// Ordinal badges as an overlay (pointer-events: none) over the editor, in the
// editor column's coordinate space. Kept out of the contentEditable so they
// don't interfere with caret/deletion at mark boundaries.
export function MarkBadges({ badges }: { badges: MarkBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div class="pointer-events-none absolute inset-0">
      {badges.map(({ key, left, top, numbers }) => {
        const label = numbers.join(", ");
        return (
          <span key={key} class="mark-badge absolute" style={{ left, top }}>
            <span aria-hidden class="mark-badge-stroke">
              {label}
            </span>
            <span class="relative">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
