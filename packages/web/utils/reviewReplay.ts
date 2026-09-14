import type { TracedReviewEvent } from "@essayist/core";

export interface PlayTraceOptions {
  /** Time multiplier, read before each gap: >1 speeds up, <1 slows down. */
  speed: () => number;
  /** Checked between events; returning true stops playback. */
  isCancelled: () => boolean;
  sleep: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export interface ReplayParams {
  runId: string;
  speed: number;
}

/**
 * Reads the replay mode from a query string: `?replay=<runId>` arms the
 * replay for that run, `?speed=<n>` is the time multiplier (>1 faster,
 * <1 slower, default 1, invalid or non-positive values fall back to 1).
 */
export function parseReplayParams(search: string): ReplayParams | null {
  const params = new URLSearchParams(search);
  const runId = params.get("replay")?.trim();
  if (!runId) return null;
  let speed = Number(params.get("speed") ?? "1");
  speed = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return { runId, speed };
}

/**
 * Drives `onEvent` for each trace event at its recorded relative timing:
 * offsets are normalized against the first event's timestamp, and each
 * gap is waited out, divided by the current speed. Speed changes take
 * effect from the next gap on. Returns false when cancelled.
 */
export async function playTrace(
  trace: readonly TracedReviewEvent[],
  onEvent: (event: TracedReviewEvent, at: number) => void,
  {
    speed = () => 1,
    isCancelled = () => false,
    sleep = defaultSleep,
  }: Partial<PlayTraceOptions> = {},
): Promise<boolean> {
  if (trace.length === 0) return true;
  const t0 = trace[0].at;
  let prevAt = 0;
  for (const event of trace) {
    const at = Math.max(0, event.at - t0);
    const gap = Math.max(0, at - prevAt);
    prevAt = at;
    const mult = speed();
    await sleep(gap / (mult > 0 ? mult : 1));
    if (isCancelled()) return false;
    onEvent(event, at);
  }
  return true;
}
