import { AsyncLocalStorage } from "node:async_hooks";
import {
  createScope,
  type Namespace,
  setResolver,
  setScopeProvider,
} from "@/signals/models.ts";

/**
 * Server-only ALS wiring for the model store: installs the scope provider
 * and wraps each request in a fresh scope. `node:async_hooks` never reaches
 * the client bundle; model access outside a request throws.
 */

const als = new AsyncLocalStorage<ReturnType<typeof createScope>>();

setScopeProvider(() => {
  const requestScope = als.getStore();
  if (!requestScope) {
    throw new Error("model store accessed outside a request scope");
  }
  return requestScope;
});

export function runRequest<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return als.run(createScope(), fn);
}

// loaders

const loaders = new Map<string, (key: string) => Promise<unknown>>();

export function registerLoader<S>(
  ns: Namespace<S>,
  loader: (key: string) => Promise<S>,
): void {
  loaders.set(ns.name, loader);
}

setResolver((ns, key) => {
  const loader = loaders.get(ns);
  if (!loader) {
    return Promise.reject(
      new Error(`model store: no loader registered for ${ns} (${key})`),
    );
  }
  return loader(key);
});
