/**
 * The model store: a per-environment cache of model data, keyed by
 * `(ns, key)`. Request-scoped via AsyncLocalStorage on the server
 * (models.server.ts), module-scoped on the client.
 */

import type { ReadonlySignal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import createAsyncState from "@/utils/asyncState.ts";

/**
 * A namespace token: the cache key plus the model's data shape. The runtime
 * value is just `name`; the marker exists for inference only and is never
 * set.
 */
export interface Namespace<Seed = unknown> {
  readonly name: string;
  readonly seedType?: Seed;
}

export function namespace<Seed = unknown>(name: string): Namespace<Seed> {
  return { name };
}

interface Scope {
  cache: Map<string, Map<string, unknown>>;
  instances: Map<string, Map<string, unknown>>;
  pending: Promise<unknown>[];
}

export function createScope(): Scope {
  return { cache: new Map(), instances: new Map(), pending: [] };
}

const moduleScope: Scope = createScope();

// Server-only override (set by models.server.ts); defaults to module scope.
let scope: () => Scope = () => moduleScope;

export function setScopeProvider(p: () => Scope): void {
  scope = p;
}

// cache

export function cacheGet<S>(ns: Namespace<S>, key: string): S | undefined {
  return scope().cache.get(ns.name)?.get(key) as S | undefined;
}

export function cacheSet<S>(ns: Namespace<S>, key: string, data: S): void {
  scope()
    .cache.getOrInsertComputed(ns.name, () => new Map())
    .set(key, data);
}

// instances

export function get<T>(ns: Namespace<unknown>, key: string, build: () => T): T {
  const map = scope().instances.getOrInsertComputed(ns.name, () => new Map());
  let inst = map.get(key) as T | undefined;
  if (!inst) {
    inst = build();
    map.set(key, inst);
  }
  return inst;
}

// model data

// Server-only: resolves data for a cache miss.
type Resolver = (ns: string, key: string) => Promise<unknown>;

let resolver: Resolver = () => {
  throw new Error("model store: no resolver installed on the server");
};

export function setResolver(p: Resolver): void {
  resolver = p;
}

/** Loading/error state plus a way to re-run a model's transport. */
export interface ModelData {
  loading: ReadonlySignal<boolean>;
  error: ReadonlySignal<string>;
  refresh: () => Promise<void>;
}

/**
 * The one data call for a model factory: cache first, then acquire. `apply`
 * absorbs data into the model's signals; `transport` is the colocated
 * client fetch, used on a cache miss in the browser.
 */
export function modelData<S>(
  ns: Namespace<S>,
  key: string,
  apply: (data: S) => void,
  transport?: () => Promise<S>,
): ModelData {
  const [run, { loading, error }] = createAsyncState(true);

  const settle = (data: S): void => {
    apply(data);
    loading.value = false;
  };

  const refresh = async (): Promise<void> => {
    if (!transport) return;
    await run(async () => {
      const data = await transport();
      cacheSet(ns, key, data);
      settle(data);
    });
  };

  const cached = cacheGet<S>(ns, key);
  if (cached !== undefined) {
    settle(cached);
  } else if (!IS_BROWSER) {
    scope().pending.push(
      run(async () => {
        const data = (await resolver(ns.name, key)) as S;
        cacheSet(ns, key, data);
        settle(data);
      }),
    );
  } else if (transport) {
    void refresh();
  } else {
    loading.value = false;
  }

  return { loading, error, refresh };
}

// drain

/** Awaits every acquisition collected in the current scope. */
export async function drain(): Promise<void> {
  const pending = scope().pending.splice(0);
  await Promise.allSettled(pending);
}

// seed artifact

interface SerializedCache {
  cache: Record<string, Record<string, unknown>>;
}

/** The request's seed: run the page's priming calls, drain the collected
 * acquisitions, and serialize the cache for the client. */
export async function seed(prime: () => void | Promise<void>): Promise<string> {
  await prime();
  await drain();
  const snapshot: SerializedCache = { cache: {} };
  for (const [ns, m] of scope().cache) {
    snapshot.cache[ns] = Object.fromEntries(m);
  }
  return JSON.stringify(snapshot);
}

function ingest(snapshot: SerializedCache): void {
  for (const [ns, entries] of Object.entries(snapshot.cache)) {
    const token = { name: ns } as Namespace<unknown>;
    for (const [k, v] of Object.entries(entries)) cacheSet(token, k, v);
  }
}

// client bootstrap: read the page blob into the (module) scope.
if (IS_BROWSER) {
  const el = document.getElementById("__essayist_seed__");
  if (el?.dataset.seed) {
    try {
      ingest(JSON.parse(el.dataset.seed) as SerializedCache);
    } catch {
      // malformed seed -- fall back to normal REST loading
    }
  }
}
