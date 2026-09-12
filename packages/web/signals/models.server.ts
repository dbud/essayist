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

/** Request environment available to loaders. */
export interface Context {
  user: User;
  url: URL;
}

interface RequestStore {
  scope: ReturnType<typeof createScope>;
  ctx: Context;
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
  ctx: Context,
): T | Promise<T> {
  return als.run({ scope: createScope(), ctx }, fn);
}

// loaders

const loaders = new Map<
  string,
  (key: unknown, ctx: Context) => Promise<unknown>
>();

export function registerLoader<S, K>(
  ns: Namespace<S, K>,
  loader: (key: K, ctx: Context) => Promise<S>,
): void {
  loaders.set(ns.name, (key, ctx) => loader(key as K, ctx));
}

setResolver((ns, key) => {
  const { ctx } = request();
  const loader = loaders.get(ns);
  if (!loader) {
    return Promise.reject(
      new Error(`model store: no loader registered for ${ns} (${key})`),
    );
  }
  return loader(key, ctx);
});
