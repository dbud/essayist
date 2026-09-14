import { signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { parseReplayParams, type ReplayParams } from "@/utils/reviewReplay.ts";

/**
 * Replay mode, read from the page URL: ?replay=<runId> (&speed=<n>).
 * Changing the speed or exiting updates the URL in place, so a reload
 * keeps the mode and back/forward follows the history entry.
 */
export const replayParams = signal<ReplayParams | null>(
  IS_BROWSER ? parseReplayParams(location.search) : null,
);

/** Turns replay mode on or off and updates the URL to match. */
export function setReplayParams(next: ReplayParams | null): void {
  replayParams.value = next;
  const url = new URL(location.href);
  if (next) {
    url.searchParams.set("replay", next.runId);
    if (next.speed !== 1) url.searchParams.set("speed", String(next.speed));
    else url.searchParams.delete("speed");
  } else {
    url.searchParams.delete("replay");
    url.searchParams.delete("speed");
  }
  // Keep the history entry's state; url.ts manages back/forward.
  history.replaceState(history.state, "", url);
}

if (IS_BROWSER) {
  addEventListener("popstate", () => {
    replayParams.value = parseReplayParams(location.search);
  });
}
