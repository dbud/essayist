import { bumpKey, watchKey } from "@/utils/kvWatch.server.ts";

/**
 * Per-isolate cache for a shared async value.
 *
 * Invariants: single-flight (concurrent calls share one load), a TTL floor
 * (a value within its TTL returns instantly; an expired value is reloaded,
 * sharing the in-flight load, before being served), and a generation guard
 * that discards loads invalidated mid-flight. Cross-isolate invalidation is
 * opt-in via a watched key plus `bump()` on the mutation path
 * (one shared kv.watch stream per KV handle, see kvWatch.server.ts);
 * without a watch policy, freshness across isolates converges within the
 * TTL.
 */

export interface CachePolicy {
  /** Revalidate at most this often. */
  ttlMs: number;
  /** Watch this key for fleet-wide invalidation; a versionstamp change
   * drops the cache ahead of the TTL. Writers that change the key should
   * bump it; ones that do not are covered by the TTL. */
  watch?: { kv: Deno.Kv; key: Deno.KvKey };
}

export interface CacheRef<S> {
  get(): Promise<S>;
  /** Drop the cached value on this isolate and, when a watch policy
   * exists, publish a fleet-wide invalidation for the watched key. */
  invalidate(): Promise<void>;
}

interface Inflight<S> {
  promise: Promise<S>;
  gen: number;
}

/**
 * Wrap a load function with single-flight dedup, a TTL floor, and explicit
 * invalidation. A value within its TTL is served synchronously (as a
 * resolved promise); an expired or missing value awaits a reload, which
 * concurrent calls share. The load must not depend on request state and
 * must resolve to a defined value. `name` only tags log lines.
 */
export function cached<S>(
  name: string,
  load: () => Promise<S>,
  policy: CachePolicy,
): CacheRef<S> {
  let value: S | undefined;
  let filledAt = 0;
  let gen = 0;
  let inflight: Inflight<S> | undefined;
  const watch = policy.watch;

  function drop(reason: string): void {
    gen++;
    value = undefined;
    filledAt = 0;
    console.debug(`kvCache: ${name} invalidated (${reason})`);
  }

  function fill(reason: string): Promise<S> {
    if (watch) watchKey(watch.kv, watch.key, () => drop("watch"));
    // Snapshot the generation this load starts under; if invalidate()
    // moves on mid-flight, the result is not published and the next
    // get() refills under the new generation.
    const g = gen;
    const promise = load()
      .then((fresh) => {
        if (g === gen) {
          value = fresh;
          filledAt = Date.now();
          console.debug(`kvCache: ${name} revalidated (${reason})`);
        }
        return fresh;
      })
      .catch((err) => {
        console.error(`kvCache: ${name} refresh failed (${reason})`, err);
        throw err;
      })
      .finally(() => {
        if (inflight?.gen === g) inflight = undefined;
      });
    inflight = { promise, gen: g };
    return promise;
  }

  return {
    get(): Promise<S> {
      if (value !== undefined && Date.now() - filledAt < policy.ttlMs) {
        return Promise.resolve(value);
      }
      const reason = value === undefined ? "miss" : "ttl";
      if (inflight?.gen === gen) return inflight.promise;
      return fill(reason);
    },
    async invalidate(): Promise<void> {
      drop("local");
      if (!watch) return;
      await bumpKey(watch.kv, watch.key);
    },
  };
}
