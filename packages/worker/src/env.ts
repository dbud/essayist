// The worker environment: Effect Config over the fetch handler's Cloudflare bindings (workerd
// exposes no process.env at module scope), memoized per isolate; vite feeds the same keys via
// .dev.vars locally.

import type { D1Database } from "@cloudflare/workers-types";
import { assert } from "@std/assert";
import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect";

const config = Config.all({
  LOG_LEVEL: Config.option(Config.String("LOG_LEVEL")),
  GOOGLE_CLIENT_ID: Config.option(Config.String("GOOGLE_CLIENT_ID")),
  GOOGLE_CLIENT_SECRET: Config.option(Config.String("GOOGLE_CLIENT_SECRET")),
  GOOGLE_API_KEY: Config.option(Config.String("GOOGLE_API_KEY")),
  GOOGLE_APP_ID: Config.option(Config.String("GOOGLE_APP_ID")),
});

export interface WorkerEnv {
  readonly logLevel: string | undefined;
  readonly googleClientId: string | undefined;
  readonly googleClientSecret: string | undefined;
  readonly googleApiKey: string | undefined;
  readonly googleAppId: string | undefined;
  readonly db: D1Database;
}

/** Google client configuration as a service, for the api tier's token flows. */
export interface GoogleConfigProps {
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  readonly apiKey: string | undefined;
  readonly appId: string | undefined;
}

export class GoogleConfig extends Context.Service<GoogleConfig, GoogleConfigProps>()(
  "@essayist/worker/env/GoogleConfig",
) {}

export function googleConfigLayer(e: WorkerEnv): Layer.Layer<GoogleConfig> {
  return Layer.succeed(GoogleConfig, {
    clientId: e.googleClientId,
    clientSecret: e.googleClientSecret,
    apiKey: e.googleApiKey,
    appId: e.googleAppId,
  });
}

let cached: WorkerEnv | undefined;

// The one boundary cast: hono's fetch env is untyped, and the D1 binding is the account's database.
function dbBinding(bindings: unknown): D1Database {
  const db = (bindings as { DB?: unknown }).DB;
  assert(db !== undefined, "the D1 binding DB is missing");
  return db as D1Database;
}

export function env(bindings: unknown): WorkerEnv {
  if (cached !== undefined) return cached;

  const db = dbBinding(bindings);
  const snapshot = Effect.runSync(
    config.pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(bindings)),
    ),
  );

  // One boot log of which variables were present; values never leave this module. Console here: the
  // runtime's json logger composes later.
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
    googleApiKey: Option.getOrUndefined(snapshot.GOOGLE_API_KEY),
    googleAppId: Option.getOrUndefined(snapshot.GOOGLE_APP_ID),
    db,
  };
  return cached;
}
