import type { ComponentChild } from "preact";
import { hydrate } from "preact";
import { APP_STATE_SCRIPT_ID, PAGE_DATA_SCRIPT_ID } from "#/app/seeds.tsx";
import {
  PreferencesProvider,
  preferencesFromCookie,
} from "#/models/preferences.ts";
import { type AppState, AppStateProvider } from "#/state.ts";

function parseSeed<T>(id: string, fallback?: T): T {
  const text = document.getElementById(id)?.textContent;
  if (text === undefined) {
    if (fallback === undefined) {
      throw new Error(`boot: #${id} missing from the document`);
    }
    return fallback;
  }
  return JSON.parse(text) as T;
}

export async function boot<Data>(
  page: (data: Data) => ComponentChild,
): Promise<void> {
  if (import.meta.env.DEV) {
    await import("preact/debug");
    const ms = Number(
      new URLSearchParams(location.search).get("hydrationDelay"),
    );
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  const data = parseSeed<Data>(PAGE_DATA_SCRIPT_ID);
  const state = parseSeed<AppState>(APP_STATE_SCRIPT_ID);
  const preferences = preferencesFromCookie(
    document.cookie,
    new URL(location.href),
  );

  hydrate(
    <AppStateProvider value={state}>
      <PreferencesProvider value={preferences}>
        {page(data)}
      </PreferencesProvider>
    </AppStateProvider>,
    document.body,
  );
}
