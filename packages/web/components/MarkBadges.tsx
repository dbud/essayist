import type { MarkBadge } from "@/signals/sidenotes.ts";

// Ordinal badges as an overlay (pointer-events: none) over the editor, in the
// editor column's coordinate space. Kept out of the contentEditable so they
// don't interfere with caret/deletion at mark boundaries.
export function MarkBadges({ badges }: { badges: MarkBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div class="pointer-events-none absolute inset-0">
      {badges.map(({ key, left, top, numbers }) => (
        <span
          key={key}
          class="mark-badge absolute font-semibold text-[var(--color-primary)]"
          style={`left:${left}px;top:${top}px`}
        >
          {numbers.join(", ")}
        </span>
      ))}
    </div>
  );
}
