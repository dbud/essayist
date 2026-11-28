// The database the dbctl commands work on, through the D1 binding wrangler gives a node script: the
// database of the vite dev server by default, or with --remote the deployed database.

import { fileURLToPath } from "node:url";

import type { D1Database } from "@cloudflare/workers-types";
import * as D1 from "@effect/sql-d1/D1Client";
import { type CoreServices, layerCoreD1 } from "@essayist/core";
import { Console, Data, Effect, Layer } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { getPlatformProxy } from "wrangler";

/** Options shared by all dbctl commands, declared on the root command. */
export type DbctlGlobals = {
  /** Only ever true or absent: --remote works on the deployed database. */
  remote?: true;
};

/** A failure a command reports to the user, such as a missing user. */
export class CommandError extends Data.TaggedError("CommandError")<{ readonly message: string }> {}

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

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

/**
 * Run a command over the core services. A failure is printed with its message and sets a failing
 * exit code.
 */
export function runStore<E extends { readonly message: string }>(
  globals: DbctlGlobals,
  command: Effect.Effect<void, E, CoreServices>,
): Promise<void> {
  return withDatabase(globals, (db) =>
    command.pipe(
      Effect.catch((error) =>
        Effect.andThen(
          Console.error(error.message),
          Effect.sync(() => {
            process.exitCode = 1;
          }),
        ),
      ),
      Effect.provide(
        Layer.unwrap(Effect.map(D1.make({ db }), layerCoreD1)).pipe(
          Layer.provide(Reactivity.layer),
        ),
      ),
      Effect.runPromise,
    ),
  );
}
