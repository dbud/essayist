// The database the dbctl commands work on, through the D1 binding wrangler gives a node script: the
// database of the vite dev server by default, or with --remote the deployed database.

import { fileURLToPath } from "node:url";

import type { D1Database } from "@cloudflare/workers-types";
import * as D1 from "@effect/sql-d1/D1Client";
import { type CoreServices, layerCoreD1 } from "@essayist/core";
import { Effect, Layer, ManagedRuntime } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { getPlatformProxy } from "wrangler";

import type { DbctlGlobals } from "#/globals.ts";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export type DbRuntime = ManagedRuntime.ManagedRuntime<CoreServices, never>;

/** Run a command on the D1 binding, closed when the command finishes. */
export async function withDatabase<T>(
  globals: DbctlGlobals,
  fn: (db: D1Database) => Promise<T>,
): Promise<T> {
  // locally the same binding is kept off the network, and its file is found by the database id in
  // the dev state of the worker; the default state path is relative to the working directory
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: path("./wrangler.jsonc"),
    ...(globals.remote === true
      ? { persist: false }
      : { remoteBindings: false, persist: { path: path("../worker/.wrangler/state/v3") } }),
  });
  try {
    return await fn(proxy.env.DB);
  } finally {
    await proxy.dispose();
  }
}

/** Run a command with the core services over the database. */
export function withStore<T>(
  globals: DbctlGlobals,
  fn: (ctx: { runtime: DbRuntime }) => Promise<T>,
): Promise<T> {
  return withDatabase(globals, async (db) => {
    const layer = Layer.unwrap(Effect.map(D1.make({ db }), layerCoreD1)).pipe(
      Layer.provide(Reactivity.layer),
    );
    const runtime = ManagedRuntime.make(layer);
    try {
      return await fn({ runtime });
    } finally {
      await runtime.dispose();
    }
  });
}
