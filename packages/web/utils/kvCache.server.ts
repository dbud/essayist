/**
 * Per-isolate cache for a shared async value.
 *
 * Invariants: single-flight (concurrent calls share one load), a TTL floor
 * (a value within its TTL returns instantly; an expired value is reloaded,
 * sharing the in-flight load, before being served), and a generation guard
 * that discards loads invalidated mid-flight. There is no cross-isolate
 * signaling, so freshness across isolates converges within the TTL.
 */

export interface CachePolicy {
  /** Revalidate at most this often. */
  ttlMs: number;
}

export interface CacheRef<S> {
  get(): Promise<S>;
  invalidate(): void;
}

/** The pending load plus the generation it was started under. */
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

  function fill(reason: string): Promise<S> {
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
    invalidate(): void {
      gen++;
      value = undefined;
      filledAt = 0;
      console.debug(`kvCache: ${name} invalidated`);
    },
  };
}
