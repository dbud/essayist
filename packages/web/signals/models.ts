import { IS_BROWSER } from "fresh/runtime";

/**
 * Generic, env-aware model store. It backs two things for every model:
 *
 *  - the instance cache (today each model's local `const cache = new Map()`)
 *  - the server-provided seed data models consult at construction
 *
 * Backing is request-scoped (AsyncLocalStorage, see models.server.ts) on the
 * server and module-level on the client. The wire boundary is serialize()/
 * ingest() over the seeds only -- model instances are not serializable and
 * are rebuilt on the client from the seed.
 *
 * Models use two calls: `get(ns, key, build)` for the instance, `seed(ns, key)`
 * for the data. Same `(ns, key)` key space; the seed is the pre-build value.
 */

export interface Scope {
  seeds: Map<string, Map<string, unknown>>;
  instances: Map<string, Map<string, unknown>>;
}

const moduleScope: Scope = {
  seeds: new Map(),
  instances: new Map(),
};

// Server-only override (set by models.server.ts); defaults to module scope.
let provider: () => Scope | undefined = () => moduleScope;

export function setScopeProvider(p: () => Scope | undefined): void {
  provider = p;
}

function scope(): Scope {
  return provider() ?? moduleScope;
}

// seed data -------------------------------------------------------------

export function seed<T>(ns: string, key: string): T | undefined {
  return scope().seeds.get(ns)?.get(key) as T | undefined;
}

export function setSeed<T>(ns: string, key: string, data: T): void {
  let map = scope().seeds.get(ns);
  if (!map) {
    map = new Map();
    scope().seeds.set(ns, map);
  }
  map.set(key, data);
}

// instance cache -------------------------------------------------------

export function get<T>(ns: string, key: string, build: () => T): T {
  let map = scope().instances.get(ns);
  if (!map) {
    map = new Map();
    scope().instances.set(ns, map);
  }
  let inst = map.get(key) as T | undefined;
  if (!inst) {
    inst = build();
    map.set(key, inst);
  }
  return inst;
}

// wire round-trip (seeds only) -----------------------------------------

export interface SerializedModels {
  seeds: Record<string, Record<string, unknown>>;
}

export function serialize(): SerializedModels {
  const out: SerializedModels = { seeds: {} };
  for (const [ns, m] of scope().seeds) {
    out.seeds[ns] = Object.fromEntries(m);
  }
  return out;
}

export function ingest(s: SerializedModels): void {
  for (const [ns, entries] of Object.entries(s.seeds)) {
    let map = scope().seeds.get(ns);
    if (!map) {
      map = new Map();
      scope().seeds.set(ns, map);
    }
    for (const [k, v] of Object.entries(entries)) map.set(k, v);
  }
}

// client bootstrap: read the page blob and populate the (module) scope.
if (IS_BROWSER) {
  const el = document.getElementById("__essayist_seed__");
  if (el?.textContent) {
    try {
      ingest(JSON.parse(el.textContent) as SerializedModels);
    } catch {
      // malformed seed -- fall back to normal REST loading
    }
  }
}
