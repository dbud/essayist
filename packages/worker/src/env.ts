// The worker environment: Effect Config over the fetch handler's Cloudflare
// bindings (workerd exposes no process.env at module scope), memoized per
// isolate; vite feeds the same keys via .dev.vars locally.

import type { D1Database } from "@cloudflare/workers-types";
import { Config, ConfigProvider, Effect, Option } from "effect";

const config = Config.all({
  LOG_LEVEL: Config.option(Config.String("LOG_LEVEL")),
  GOOGLE_CLIENT_ID: Config.option(Config.String("GOOGLE_CLIENT_ID")),
  GOOGLE_CLIENT_SECRET: Config.option(Config.String("GOOGLE_CLIENT_SECRET")),
});

export interface WorkerEnv {
  readonly logLevel: string | undefined;
  readonly googleClientId: string | undefined;
  readonly googleClientSecret: string | undefined;
  readonly db: D1Database;
}

let cached: WorkerEnv | undefined;

// The one boundary cast: hono's fetch env is untyped, and the D1 binding
// is the account's database.
function dbBinding(bindings: unknown): D1Database {
  const db = (bindings as { DB?: unknown }).DB;
  if (db === undefined) throw new Error("the D1 binding DB is missing");
  return db as D1Database;
}

export function env(bindings: unknown): WorkerEnv {
  if (cached !== undefined) return cached;

  const db = dbBinding(bindings);
  const snapshot = Effect.runSync(
    config.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(bindings),
      ),
    ),
  );

  // One boot log of which variables were present; values never leave this
  // module. Console here: the runtime's json logger composes later.
  Effect.runSync(
    Effect.logInfo("worker environment loaded", {
      present: Object.entries(snapshot)
        .filter(([, option]) => option._tag === "Some")
        .map(([name]) => name),
    }),
  );

  cached = {
    logLevel: Option.getOrUndefined(snapshot.LOG_LEVEL),
    googleClientId: Option.getOrUndefined(snapshot.GOOGLE_CLIENT_ID),
    googleClientSecret: Option.getOrUndefined(snapshot.GOOGLE_CLIENT_SECRET),
    db,
  };
  return cached;
}
