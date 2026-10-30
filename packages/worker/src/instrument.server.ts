import { defineCloudflareOptions } from "@sentry/cloudflare";

import { env } from "#/env.ts";

export default defineCloudflareOptions((bindings) => {
  const { sentryDsn } = env(bindings);
  return {
    dsn: sentryDsn,
    tracesSampleRate: 0.2,
  };
});
