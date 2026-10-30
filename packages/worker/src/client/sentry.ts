const meta = document.querySelector<HTMLMetaElement>("meta[name='sentry-dsn']");

export function reportError(error: unknown): void {
  void import("@sentry/browser").then((Sentry) => Sentry.captureException(error));
}

void import("@sentry/browser").then((Sentry) => {
  Sentry.init({
    dsn: meta?.content,
    environment: meta?.dataset.environment,
    release: meta?.dataset.release,
  });
});
