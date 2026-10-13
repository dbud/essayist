/**
 * The server environment, read once at boot through Effect Config: the
 * vite plugin exports the .env files before this module evaluates, and a
 * different provider (Cloudflare bindings) composes here when web leaves
 * Deno Deploy.
 */

import { Config, Effect, Option } from "effect";

const optional = (name: string) => Config.option(Config.String(name));

const snapshot = Effect.runSync(
  Config.all({
    DENO_ENV: optional("DENO_ENV"),
    DEMO_USER_DISABLED: optional("DISABLE_DEMO_USER"),
    SENTRY_DSN: optional("SENTRY_DSN"),
    SENTRY_RELEASE: optional("DENO_DEPLOYMENT_ID"),
    GOOGLE_API_KEY: optional("GOOGLE_API_KEY"),
    GOOGLE_APP_ID: optional("GOOGLE_APP_ID"),
    GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET"),
    OPENROUTER_API_KEY: optional("OPENROUTER_API_KEY"),
  }),
);

/** One boot log of which variables were present. Values never leave this
 * module. */
Effect.runSync(
  Effect.logInfo("server environment loaded", {
    present: Object.entries(snapshot)
      .filter(([, value]) => value._tag === "Some")
      .map(([name]) => name),
  }),
);

export const env = {
  isDev:
    snapshot.DENO_ENV._tag === "Some" &&
    snapshot.DENO_ENV.value === "development",
  demoUserDisabled:
    snapshot.DEMO_USER_DISABLED._tag === "Some" &&
    snapshot.DEMO_USER_DISABLED.value === "1",
  sentryDsn: Option.getOrUndefined(snapshot.SENTRY_DSN),
  sentryEnvironment: Option.getOrUndefined(snapshot.DENO_ENV) ?? "production",
  sentryRelease: Option.getOrUndefined(snapshot.SENTRY_RELEASE),
  googleApiKey: Option.getOrUndefined(snapshot.GOOGLE_API_KEY),
  googleAppId: Option.getOrUndefined(snapshot.GOOGLE_APP_ID),
  googleClientId: Option.getOrUndefined(snapshot.GOOGLE_CLIENT_ID),
  googleClientSecret: Option.getOrUndefined(snapshot.GOOGLE_CLIENT_SECRET),
  openrouterApiKey: Option.getOrUndefined(snapshot.OPENROUTER_API_KEY),
};
