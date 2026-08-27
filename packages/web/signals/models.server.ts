import { AsyncLocalStorage } from "node:async_hooks";
import { type Scope, setScopeProvider } from "@/signals/models.ts";

/**
 * Server-only ALS wiring for the model store. Imported by the models
 * middleware (server-side), so `node:async_hooks` never reaches the client
 * bundle. Installs a scope provider that returns the current request's
 * scope, and exports `runRequest` to wrap a request in a fresh scope.
 */

const als = new AsyncLocalStorage<Scope>();

setScopeProvider(() => als.getStore());

export function runRequest<T>(fn: () => T | Promise<T>): T | Promise<T> {
  const requestScope: Scope = {
    seeds: new Map(),
    instances: new Map(),
  };
  return als.run(requestScope, fn);
}
