import { LucideProvider } from "lucide-preact";
import type { ComponentChildren } from "preact";

import { type Preferences, PreferencesProvider } from "#/models/preferences.ts";
import { type AppState, AppStateProvider } from "#/state.ts";

export function AppProviders({
  state,
  preferences,
  children,
}: {
  state: AppState;
  preferences: Preferences;
  children?: ComponentChildren;
}) {
  return (
    <AppStateProvider value={state}>
      <PreferencesProvider value={preferences}>
        <LucideProvider size={18}>{children}</LucideProvider>
      </PreferencesProvider>
    </AppStateProvider>
  );
}
