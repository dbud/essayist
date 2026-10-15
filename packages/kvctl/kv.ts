// Store wiring shared by kvctl commands: one runtime over a D1 database,
// via the REST transport (the remote account) or, with --local, the sqlite
// transport over the vite dev server's D1 state.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { D1Database } from "@cloudflare/workers-types";
import * as D1 from "@effect/sql-d1/D1Client";
import {
  ChunkedValues,
  type Entry,
  type Key,
  Persistence,
  type PersistenceError,
  ReviewConfig,
  TraceEvents,
  Workspaces,
} from "@essayist/core";
import { KV_D1_SCHEMA, layerKvD1 } from "@essayist/core/kv_d1";
import { type D1RestConfig, d1RestDatabase } from "@essayist/core/kv_d1_rest";
import { d1SqliteShim } from "@essayist/core/kv_d1_sqlite";
import { Config, Effect, Layer, ManagedRuntime } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import type { KvctlGlobals } from "#/globals.ts";

/** The services kvctl commands reach through the runtime. */
export type KvRuntime = ManagedRuntime.ManagedRuntime<
  Workspaces | ReviewConfig | TraceEvents | ChunkedValues | Persistence,
  PersistenceError
>;

interface StoreCtx {
  readonly runtime: KvRuntime;
}

// The vite dev server's D1 lives under the worker package's wrangler state.
const D1_STATE = fileURLToPath(
  new URL("../worker/.wrangler/state/v3/d1", import.meta.url),
);

function localDatabase(): D1Database {
  const files = readdirSync(D1_STATE, { recursive: true })
    .filter((path): path is string => typeof path === "string")
    .filter((path) => path.endsWith(".sqlite"));
  if (files.length === 0) {
    throw new Error(
      "no local D1 state; start the vite dev server once, then retry",
    );
  }
  if (files.length > 1) {
    throw new Error(
      `several local D1 state files; not sure which:\n  ${files.join("\n  ")}`,
    );
  }
  const db = new DatabaseSync(join(D1_STATE, files[0]));
  db.exec(KV_D1_SCHEMA);
  return d1SqliteShim(db);
}

function restConfig(): D1RestConfig {
  try {
    return Effect.runSync(
      Config.all({
        accountId: Config.String("CLOUDFLARE_ACCOUNT_ID"),
        databaseId: Config.String("CLOUDFLARE_D1_DATABASE_ID"),
        apiToken: Config.String("CLOUDFLARE_API_TOKEN"),
      }),
    );
  } catch {
    console.error(
      "kvctl needs CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN in .env",
    );
    process.exit(1);
  }
}

function database(globals: KvctlGlobals): D1Database {
  // --target overrides which remote database id is used.
  if (globals.target !== undefined) {
    return d1RestDatabase({
      ...restConfig(),
      databaseId: globals.target,
    });
  }
  if (globals.local === true) return localDatabase();
  return d1RestDatabase(restConfig());
}

// One layer: the domain services plus Persistence in the runtime context
// (the raw listings need it), all over the one database.
export function storeLayer(
  db: D1Database,
): Layer.Layer<
  Workspaces | ReviewConfig | TraceEvents | ChunkedValues | Persistence
> {
  const d1 = Layer.unwrap(Effect.map(D1.make({ db }), layerKvD1)).pipe(
    Layer.provide(Reactivity.layer),
  );
  return Layer.provide(
    Layer.mergeAll(
      Workspaces.layerNoDeps,
      ReviewConfig.layerNoDeps,
      Layer.provide(TraceEvents.layerNoDeps, ChunkedValues.layerNoDeps),
      ChunkedValues.layerNoDeps,
      d1,
    ),
    d1,
  );
}

export async function withStore<T>(
  globals: KvctlGlobals,
  fn: (ctx: StoreCtx) => Promise<T>,
): Promise<T> {
  const runtime: KvRuntime = ManagedRuntime.make(storeLayer(database(globals)));
  try {
    return await fn({ runtime });
  } finally {
    await runtime.dispose();
  }
}

/** Yield every entry under a prefix, paging through cursors. */
export async function* listAll<T>(
  runtime: KvRuntime,
  prefix: Key,
): AsyncGenerator<Entry<T>> {
  let cursor: string | undefined;
  do {
    const page = await runtime.runPromise(
      Effect.gen(function* () {
        const store = yield* Persistence;
        return yield* store.list<T>(prefix, { cursor: cursor });
      }),
    );
    for (const entry of page.entries) yield entry;
    cursor = page.cursor;
  } while (cursor !== undefined);
}
