/**
 * The model store: a per-environment cache of model data, keyed by
 * `(ns, key)`. Request-scoped via AsyncLocalStorage on the server
 * (models.server.ts), module-scoped on the client.
 */

/**
 * A namespace token: the cache key plus the model's seed and instance
 * shapes. The runtime value is just `name`; the `*Type` markers exist for
 * inference only and are never set.
 */
export interface Namespace<Seed = unknown, Instance = unknown> {
  readonly name: string;
  readonly seedType?: Seed;
  readonly instanceType?: Instance;
}

export function namespace<Seed, Instance>(
  name: string,
): Namespace<Seed, Instance> {
  return { name };
}

interface Scope {
  seeds: Map<string, Map<string, unknown>>;
  instances: Map<string, Map<string, unknown>>;
}

function createScope(): Scope {
  return { seeds: new Map(), instances: new Map() };
}

const moduleScope: Scope = createScope();

// Server-only override (set by models.server.ts); defaults to module scope.
let scope: () => Scope = () => moduleScope;

export function setScopeProvider(p: () => Scope): void {
  scope = p;
}

// cache

export function cacheGet<S>(
  ns: Namespace<S, unknown>,
  key: string,
): S | undefined {
  return scope().seeds.get(ns.name)?.get(key) as S | undefined;
}

export function cacheSet<S>(
  ns: Namespace<S, unknown>,
  key: string,
  data: S,
): void {
  scope()
    .seeds.getOrInsertComputed(ns.name, () => new Map())
    .set(key, data);
}
