// The worker environment: Effect Config over the fetch handler's Cloudflare bindings (workerd
// exposes no process.env at module scope), memoized per isolate; vite feeds the same keys via
// .dev.vars locally.

import type { D1Database } from "@cloudflare/workers-types";
import { assert } from "@std/assert";
import { Config, ConfigProvider, Context, Effect, Layer, Option, Schema } from "effect";

const config = Config.all({
  LOG_LEVEL: Config.option(Config.String("LOG_LEVEL")),
  GOOGLE_CLIENT_ID: Config.option(Config.String("GOOGLE_CLIENT_ID")),
  GOOGLE_CLIENT_SECRET: Config.option(Config.String("GOOGLE_CLIENT_SECRET")),
  GOOGLE_API_KEY: Config.option(Config.String("GOOGLE_API_KEY")),
  GOOGLE_APP_ID: Config.option(Config.String("GOOGLE_APP_ID")),
  SENTRY_DSN: Config.String("SENTRY_DSN"),
  SENTRY_RELEASE: Config.option(Config.String("SENTRY_RELEASE")),
  SENTRY_ENVIRONMENT: Config.option(Config.String("SENTRY_ENVIRONMENT")),
  // keep heartbeat < stale < retry
  DRIVER_HEARTBEAT_MS: Config.schema(Schema.NumberFromString, "DRIVER_HEARTBEAT_MS").pipe(
    Config.withDefault(30_000),
  ),
  DRIVER_STALE_MS: Config.schema(Schema.NumberFromString, "DRIVER_STALE_MS").pipe(
    Config.withDefault(75_000),
  ),
  DRIVER_RETRY_MS: Config.schema(Schema.NumberFromString, "DRIVER_RETRY_MS").pipe(
    Config.withDefault(90_000),
  ),
  STUB_MODEL_DELAY_MS: Config.option(Config.schema(Schema.NumberFromString, "STUB_MODEL_DELAY_MS")),
  STUB_MODEL_FAULTS: Config.option(Config.schema(Schema.NumberFromString, "STUB_MODEL_FAULTS")),
});

export interface WorkerEnv {
  readonly logLevel: string | undefined;
  readonly googleClientId: string | undefined;
  readonly googleClientSecret: string | undefined;
  readonly googleApiKey: string | undefined;
  readonly googleAppId: string | undefined;
  readonly sentryDsn: string;
  readonly sentryRelease: string | undefined;
  readonly sentryEnvironment: string | undefined;
  readonly driverHeartbeatMs: number;
  readonly driverStaleMs: number;
  readonly driverRetryMs: number;
  readonly stubModelDelayMs: number | undefined;
  readonly stubModelFaults: number | undefined;
  readonly db: D1Database;
  readonly runDriver: Cloudflare.Env["RUN_DRIVER"];
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

export function env(bindings: Cloudflare.Env): WorkerEnv {
  if (cached !== undefined) return cached;

  const db = bindings.DB;
  assert(db !== undefined, "the D1 binding DB is missing");

  const runDriver = bindings.RUN_DRIVER;
  assert(runDriver !== undefined, "the RUN_DRIVER binding is missing");

  const snapshot = Effect.runSync(
    config.pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(bindings)),
    ),
  );

  cached = {
    logLevel: Option.getOrUndefined(snapshot.LOG_LEVEL),
    googleClientId: Option.getOrUndefined(snapshot.GOOGLE_CLIENT_ID),
    googleClientSecret: Option.getOrUndefined(snapshot.GOOGLE_CLIENT_SECRET),
    googleApiKey: Option.getOrUndefined(snapshot.GOOGLE_API_KEY),
    googleAppId: Option.getOrUndefined(snapshot.GOOGLE_APP_ID),
    sentryDsn: snapshot.SENTRY_DSN,
    sentryRelease: Option.getOrUndefined(snapshot.SENTRY_RELEASE),
    // Without the var, prod builds land on Sentry's own production default.
    sentryEnvironment:
      Option.getOrUndefined(snapshot.SENTRY_ENVIRONMENT) ??
      (import.meta.env.DEV ? "development" : undefined),
    driverHeartbeatMs: snapshot.DRIVER_HEARTBEAT_MS,
    driverStaleMs: snapshot.DRIVER_STALE_MS,
    driverRetryMs: snapshot.DRIVER_RETRY_MS,
    stubModelDelayMs: Option.getOrUndefined(snapshot.STUB_MODEL_DELAY_MS),
    stubModelFaults: Option.getOrUndefined(snapshot.STUB_MODEL_FAULTS),
    db,
    runDriver,
  };
  return cached;
}
