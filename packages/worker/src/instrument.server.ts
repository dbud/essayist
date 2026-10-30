import { defineCloudflareOptions } from "@sentry/cloudflare";

import { env } from "#/env.ts";

export default defineCloudflareOptions((bindings) => {
  const { sentryDsn } = env(bindings);
  if (sentryDsn === undefined) return undefined;
  return {
    dsn: sentryDsn,
    tracesSampleRate: 0.2,
  };
});
