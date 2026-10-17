import type { ComponentChild } from "preact";
import { hydrate } from "preact";
import { APP_STATE_SCRIPT_ID, PAGE_DATA_SCRIPT_ID } from "#/app/seeds.tsx";
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
  }

  const data = parseSeed<Data>(PAGE_DATA_SCRIPT_ID);
  const state = parseSeed<AppState>(APP_STATE_SCRIPT_ID);

  hydrate(
    <AppStateProvider value={state}>{page(data)}</AppStateProvider>,
    document.body,
  );
}
