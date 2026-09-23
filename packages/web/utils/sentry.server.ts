// The SDK hook must register before any other module loads.
import "@sentry/deno/import";
import * as Sentry from "@sentry/deno";

const dsn = Deno.env.get("SENTRY_DSN");

if (dsn) {
  Sentry.init({
    dsn,
    environment: Deno.env.get("DENO_ENV") ?? "production",
    release: Deno.env.get("DENO_DEPLOYMENT_ID"),
    dataCollection: {
      httpBodies: [],
      httpHeaders: false,
      cookies: false,
      genAI: { inputs: false, outputs: false },
    },
  });
}

export { Sentry };
