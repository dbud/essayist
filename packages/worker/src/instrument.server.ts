import { defineCloudflareOptions } from "@sentry/cloudflare";

import { env } from "#/env.ts";

export default defineCloudflareOptions((bindings) => {
  const { sentryDsn, sentryEnvironment, sentryRelease } = env(bindings);
  return {
    dsn: sentryDsn,
    environment: sentryEnvironment,
    release: sentryRelease,
    tracesSampleRate: 0.2,
  };
});
