import type { MiddlewareHandler } from "hono";
import type { ComponentChildren } from "preact";
import { render } from "preact-render-to-string";

import { env } from "#/env.ts";
import {
  type Preferences,
  PreferencesProvider,
  preferencesFromCookie,
} from "#/models/preferences.ts";
import { clientScriptUrl, styleSheetUrl } from "#/pages/meta.ts";
import { type AppState, AppStateProvider } from "#/state.ts";

import { AppStateScript, PageDataScript } from "./seeds";

export interface DocumentProps {
  readonly title: string;
  readonly client?: string;
  readonly data?: unknown;
  readonly sentry: {
    readonly dsn: string;
    readonly environment?: string;
    readonly release?: string;
  };
  readonly state: AppState;
  readonly preferences: Preferences;
  readonly children?: ComponentChildren;
}

export function Document({
  title,
  client,
  data,
  sentry,
  state,
  preferences,
  children,
}: DocumentProps) {
  const { themeOverride, sansFont, serifFont } = preferences;
  return (
    <html
      lang="en"
      data-theme={themeOverride.value}
      data-sans-font={sansFont.value}
      data-serif-font={serifFont.value}
    >
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta
          name="sentry-dsn"
          content={sentry.dsn}
          data-environment={sentry.environment}
          data-release={sentry.release}
        />
        <link rel="stylesheet" href={styleSheetUrl()} />
        {data !== undefined && <PageDataScript data={data} />}
        <AppStateScript state={state} />
        {client !== undefined && <script type="module" src={clientScriptUrl(client)} />}
      </head>
      <body class="h-dvh flex flex-col">
        <AppStateProvider value={state ?? {}}>
          <PreferencesProvider value={preferences}>{children}</PreferencesProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}

export const pageRenderer: MiddlewareHandler = async (c, next) => {
  const e = env(c.env);
  c.setRenderer((content, props) => {
    const state = {
      user: c.get("auth-user"),
      sessionId: c.get("auth-session-id"),
    };
    const preferences = preferencesFromCookie(c.req.header("cookie"), new URL(c.req.url));
    const sentry = {
      dsn: e.sentryDsn,
      environment: e.sentryEnvironment,
      release: e.sentryRelease,
    };
    const node = (
      <Document {...props} sentry={sentry} state={state} preferences={preferences}>
        {content}
      </Document>
    );
    return c.html(`<!doctype html>${render(node)}`);
  });
  await next();
};
