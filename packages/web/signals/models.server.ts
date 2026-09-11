import { AsyncLocalStorage } from "node:async_hooks";
import type { User } from "@essayist/core";
import {
  createScope,
  type Namespace,
  setResolver,
  setScopeProvider,
} from "@/signals/models.ts";

/**
 * Server-only ALS wiring for the model store: `node:async_hooks` never
 * reaches the client bundle, and model access outside a request throws.
 */

interface RequestStore {
  scope: ReturnType<typeof createScope>;
  user: User;
}

const als = new AsyncLocalStorage<RequestStore>();

function request(): RequestStore {
  const store = als.getStore();
  if (!store) {
    throw new Error("model store accessed outside a request scope");
  }
  return store;
}

setScopeProvider(() => request().scope);

export function runRequest<T>(
  fn: () => T | Promise<T>,
  user: User,
): T | Promise<T> {
  return als.run({ scope: createScope(), user }, fn);
}

// loaders

const loaders = new Map<
  string,
  (key: unknown, user: User) => Promise<unknown>
>();

export function registerLoader<S, K>(
  ns: Namespace<S, K>,
  loader: (key: K, user: User) => Promise<S>,
): void {
  loaders.set(ns.name, (key, user) => loader(key as K, user));
}

setResolver((ns, key) => {
  const { user } = request();
  const loader = loaders.get(ns);
  if (!loader) {
    return Promise.reject(
      new Error(`model store: no loader registered for ${ns} (${key})`),
    );
  }
  return loader(key, user);
});
