import { AsyncLocalStorage } from "node:async_hooks";
import { createScope, setScopeProvider } from "@/signals/models.ts";

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
