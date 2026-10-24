import { effect, type Signal, signal } from "@preact/signals";
import { createModelContext } from "#/models/utils/context.ts";
import {
  readPreferencesCookie,
  writePreferencesCookie,
} from "#/utils/preferencesCookie.ts";

/** The preference values, as they travel in the cookie. */
export interface PreferenceValues {
  readonly debugSidebarOpened: boolean;
}

export const DEFAULT_PREFERENCES: PreferenceValues = {
  debugSidebarOpened: false,
};

/** The cookie payload is user-editable, so every value is validated. */
function readValues(raw: Record<string, unknown>): PreferenceValues {
  return {
    debugSidebarOpened:
      typeof raw.debugSidebarOpened === "boolean"
        ? raw.debugSidebarOpened
        : DEFAULT_PREFERENCES.debugSidebarOpened,
  };
}

export interface Preferences {
  readonly debugSidebarOpened: Signal<boolean>;
}

/**
 * The preferences for a request (server) or a page load (browser), read from
 * a cookie string: the request header on the server, `document.cookie` in the
 * browser.
 */
export function preferencesFromCookie(
  source: string | null | undefined,
  url: URL,
): Preferences {
  const values = readValues(readPreferencesCookie(source, url));
  return createPreferences(values, url);
}

function createPreferences(values: PreferenceValues, url: URL): Preferences {
  const debugSidebarOpened = signal(values.debugSidebarOpened);

  if (!import.meta.env.SSR) {
    let initial = true;
    effect(() => {
      const payload = { debugSidebarOpened: debugSidebarOpened.value };
      // The first run would write back the values that were just read.
      if (initial) {
        initial = false;
        return;
      }
      writePreferencesCookie(payload, url);
    });
  }

  return { debugSidebarOpened };
}

export const { Provider: PreferencesProvider, use: usePreferences } =
  createModelContext<Preferences>("Preferences");
