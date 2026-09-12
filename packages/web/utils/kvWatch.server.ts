/**
 * Versionstamp watches over a KV handle: one supervised kv.watch stream
 * per handle (see supervisedStream.server.ts), watching the keys of all
 * subscribers on that handle. `watchKey` subscribes a callback for one
 * key, `bumpKey` publishes a change (the written value is irrelevant;
 * only the new versionstamp matters).
 */

import {
  type SupervisedStream,
  supervise,
} from "@/utils/supervisedStream.server.ts";

interface Watcher {
  subs: Map<string, Sub>;
  supervisor?: SupervisedStream;
}

interface Sub {
  key: Deno.KvKey;
  onChange: () => void;
}

/** Per-run state: the subscriptions this run tracks, keyed by key. */
interface Run {
  tracked: Map<string, Tracked>;
}

/** A subscription as tracked for one stream run: `stamp` is the last
 * seen versionstamp of the key, unset until the stream's baseline
 * batch. */
interface Tracked {
  sub: Sub;
  stamp?: string | null;
}

const registry = new Map<Deno.Kv, Watcher>();

function keyId(key: Deno.KvKey): string {
  return JSON.stringify(key);
}

/**
 * Call `onChange` whenever `key`'s versionstamp changes on this handle.
 * The first batch of a (re)opened stream reflects the values at stream
 * start and does not fire.
 */
export function watchKey(
  kv: Deno.Kv,
  key: Deno.KvKey,
  onChange: () => void,
): void {
  const watcher = registry.getOrInsertComputed(kv, () => ({
    subs: new Map(),
  }));
  const id = keyId(key);
  const existing = watcher.subs.get(id);
  if (existing) {
    // Re-subscribing swaps the callback; the stream keeps watching the key.
    existing.onChange = onChange;
    return;
  }
  watcher.subs.set(id, { key, onChange });
  if (watcher.supervisor) {
    // The stream is up: reopen it with the grown key set.
    watcher.supervisor.restart();
    return;
  }
  watcher.supervisor = supervise({
    name: "kvWatch",
    start: () => ({
      tracked: new Map(
        watcher.subs.entries().map(([id, sub]) => [id, { sub }]),
      ),
    }),
    open: ({ tracked }: Run) =>
      kv
        .watch([...tracked.values().map(({ sub }) => sub.key)])
        [Symbol.asyncIterator](),
    onItem: dispatch,
  });
}

/**
 * Apply one watch batch: for each entry, compare its versionstamp
 * against the previously seen one and call the matching onChange on a
 * change. A key with no recorded stamp yet belongs to the stream's
 * baseline batch, which records stamps and calls nothing.
 */
function dispatch(entries: Deno.KvEntryMaybe<unknown>[], run: Run): void {
  for (const entry of entries) {
    const tracked = run.tracked.get(keyId(entry.key));
    if (!tracked) continue;
    if (tracked.stamp !== undefined && tracked.stamp !== entry.versionstamp) {
      tracked.sub.onChange();
    }
    tracked.stamp = entry.versionstamp;
  }
}

/** Publish a change for `key`; watchers on all isolates see it. */
export async function bumpKey(kv: Deno.Kv, key: Deno.KvKey): Promise<void> {
  try {
    await kv.set(key, Date.now());
  } catch (err) {
    console.error(`kvWatch: bump failed for ${keyId(key)}`, err);
  }
}
