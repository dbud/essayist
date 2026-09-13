/**
 * The model store: a per-environment cache of model data, keyed by
 * `(ns, key)`. Request-scoped via AsyncLocalStorage on the server
 * (models.server.ts), module-scoped on the client.
 */

import type { ReadonlySignal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import createAsyncState from "@/utils/asyncState.ts";

/**
 * A namespace token: the cache key's shape plus the model's data shape.
 * The runtime value is just `name`; the markers exist for inference only
 * and are never set. Keys may be strings or structured values -- the store
 * canonicalizes them internally.
 */
export interface Namespace<Seed = unknown, Key = string> {
  readonly name: string;
  readonly seedType?: Seed;
  readonly keyType?: Key;
}

export function namespace<Seed = unknown, Key = string>(
  name: string,
): Namespace<Seed, Key> {
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

function canonicalKey(key: unknown): string {
  return typeof key === "string" ? key : JSON.stringify(key);
}

function cacheGet<S, K>(ns: Namespace<S, K>, key: K): S | undefined {
  return scope().cache.get(ns.name)?.get(canonicalKey(key)) as S | undefined;
}

function cacheSet<S, K>(ns: Namespace<S, K>, key: K, data: S): void {
  scope()
    .cache.getOrInsertComputed(ns.name, () => new Map())
    .set(canonicalKey(key), data);
}

// instances

export function get<T, K>(
  ns: Namespace<unknown, K>,
  key: K,
  build: () => T,
): T {
  const map = scope().instances.getOrInsertComputed(ns.name, () => new Map());
  let inst = map.get(canonicalKey(key)) as T | undefined;
  if (!inst) {
    inst = build();
    map.set(canonicalKey(key), inst);
  }
  return inst;
}

export function instances<T>(ns: Namespace<unknown, unknown>): MapIterator<T> {
  const map = scope().instances.get(ns.name);
  return (map ?? new Map<string, T>()).values() as MapIterator<T>;
}

// model data

// Server-only: resolves data for a cache miss.
type Resolver = (ns: string, key: unknown) => Promise<unknown>;

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
export function modelData<S, K>(
  ns: Namespace<S, K>,
  key: K,
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

  const cached = cacheGet<S, K>(ns, key);
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
async function drain(): Promise<void> {
  const pending = scope().pending.splice(0);
  await Promise.allSettled(pending);
}

// seed plan

type Plan = Generator<unknown, void, unknown>;

/**
 * A plan step for `seed`: suspends the plan until every acquisition
 * queued so far has settled, then resumes with the same model. Read the
 * model's signals after settling; always yield via `settle`/`settleAll`.
 */
export function* settle<T>(model: T): Generator<T, T, unknown> {
  return (yield model) as T;
}

/** Parallel `settle`: one drain for all models, resumed as a tuple. */
export function* settleAll<T extends unknown[]>(
  ...models: T
): Generator<T, T, unknown> {
  return (yield models) as T;
}

/** Drives a plan: settles pending acquisitions after every step,
 * including completion, so models queued by the plan's last step are
 * included. */
async function drive(gen: Plan): Promise<void> {
  let resume: unknown;
  for (;;) {
    const next = gen.next(resume);
    await drain();
    if (next.done) break;
    resume = next.value;
  }
}

// seed artifact

type SerializedCache = Record<string, Record<string, unknown>>;

/** The request's seed: run the page's plan to a fully settled state and
 * serialize the cache for the client. The plan yields with
 * `settle`/`settleAll` at each data dependency. */
export async function seed(plan: () => Plan): Promise<string> {
  await drive(plan());
  const snapshot: SerializedCache = {};
  for (const [ns, m] of scope().cache) {
    snapshot[ns] = Object.fromEntries(m);
  }
  return JSON.stringify(snapshot);
}

function ingest(snapshot: SerializedCache): void {
  for (const [ns, entries] of Object.entries(snapshot)) {
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
