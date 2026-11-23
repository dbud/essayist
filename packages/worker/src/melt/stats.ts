/** The parts of a melt frame that are timed. flush to opacity are parts of measure(): flush is the
    first read of the root, which waits for the browser to finish any pending style and layout. */
export const TIMED_PARTS = [
  "animations",
  "flush",
  "styles",
  "rects",
  "opacity",
  "layout",
  "draw",
  "gpu",
] as const;

export type TimedPart = (typeof TIMED_PARTS)[number];

let totals = emptyTotals();

function emptyTotals(): Record<TimedPart, number> {
  return Object.fromEntries(TIMED_PARTS.map((part) => [part, 0])) as Record<TimedPart, number>;
}

/** Adds to the milliseconds spent on a part across every root since the last take. gpu is only
    measured while debugging, and is part of draw. */
export function addTime(part: TimedPart, ms: number): void {
  totals[part] += ms;
}

/** Runs read and adds its time to a part. */
export function timed<T>(part: TimedPart, read: () => T): T {
  const started = performance.now();
  const value = read();
  addTime(part, performance.now() - started);
  return value;
}

/** The totals since the last call, which start again from 0. */
export function takeFrameStats(): Record<TimedPart, number> {
  const taken = totals;
  totals = emptyTotals();
  return taken;
}
