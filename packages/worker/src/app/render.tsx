import type { MiddlewareHandler } from "hono";
import type { ComponentChildren } from "preact";
import { render } from "preact-render-to-string";
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
  readonly state: AppState;
  readonly preferences: Preferences;
  readonly children?: ComponentChildren;
}

export function Document({
  title,
  client,
  data,
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
        <link rel="stylesheet" href={styleSheetUrl()} />
        {data !== undefined && <PageDataScript data={data} />}
        <AppStateScript state={state} />
        {client !== undefined && (
          <script type="module" src={clientScriptUrl(client)} />
        )}
      </head>
      <body class="h-dvh flex flex-col">
        <AppStateProvider value={state ?? {}}>
          <PreferencesProvider value={preferences}>
            {children}
          </PreferencesProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}

// The app state seeds from the middleware-resolved context, so pages read
// it via useAppState. New request-scoped context (workspace, file) extends
// here.
export const pageRenderer: MiddlewareHandler = async (c, next) => {
  c.setRenderer((content, props) => {
    const state = {
      user: c.get("auth-user"),
      sessionId: c.get("auth-session-id"),
    };
    const preferences = preferencesFromCookie(
      c.req.header("cookie"),
      new URL(c.req.url),
    );
    const node = (
      <Document {...props} state={state} preferences={preferences}>
        {content}
      </Document>
    );
    return c.html(`<!doctype html>${render(node)}`);
  });
  await next();
};
