import * as Sentry from "@sentry/cloudflare";

export function captureError(error: unknown): void {
  if (!Sentry.isEnabled()) return;
  Sentry.captureException(error);
}
