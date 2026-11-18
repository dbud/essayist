import type { MarkFragmentBadge } from "#/models/sidenotes.ts";

// runs of at least three collapse to a range with an en dash, the rest stay comma-separated.
function compact(ordinals: number[]): string {
  const runs = ordinals.reduce<number[][]>((groups, ordinal) => {
    const last = groups.at(-1);
    if (last?.at(-1) === ordinal - 1) {
      last.push(ordinal);
    } else {
      groups.push([ordinal]);
    }
    return groups;
  }, []);
  return runs
    .map((run) => (run.length < 3 ? run.join(", ") : `${run[0]}–${run.at(-1)}`))
    .join(", ");
}

// Ordinal badges as an overlay (pointer-events: none) over the editor, in the coordinate space of
// the editor column. Kept out of the contentEditable so they don't interfere with caret/deletion at
// mark boundaries.
export function MarkFragmentBadges({ badges }: { badges: MarkFragmentBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div class="pointer-events-none absolute inset-0">
      {badges.map(({ key, left, top, ordinals }) => {
        const label = compact(ordinals);
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
