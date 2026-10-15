// The SDK hook must register before any other module loads.
import "@sentry/deno/import";
import * as Sentry from "@sentry/deno";
import { env } from "#/env.ts";

// The middleware and error reporter share this module's SDK instance.
export { Sentry };

if (env.sentryDsn) {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    release: env.sentryRelease,
    dataCollection: {
      httpBodies: [],
      httpHeaders: false,
      cookies: false,
      genAI: { inputs: false, outputs: false },
    },
  });
}
