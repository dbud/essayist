const meta = document.querySelector<HTMLMetaElement>("meta[name='sentry-dsn']");
const dsn = meta?.content;

if (dsn) {
  import("@sentry/browser").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: meta?.dataset.environment,
      release: meta?.dataset.release,
      dataCollection: {
        httpBodies: [],
        httpHeaders: false,
        cookies: false,
      },
    });
  });
}
