import { computed, effect, type Signal, signal } from "@preact/signals";

import { createModelContext } from "#/models/utils/context.ts";
import { readPreferencesCookie, writePreferencesCookie } from "#/utils/preferencesCookie.ts";

export type Theme = "light" | "dark";
export type HighlightStyle = "band" | "wavy";
export type SansFont = "atkinson" | "gothic" | "system";
export type SerifFont = "vollkorn" | "plex" | "system";
export type AdminTab = "passes" | "graph" | "pools" | "prompts" | "categories";

const THEME_VALUES: ReadonlySet<Theme> = new Set<Theme>(["light", "dark"]);
const HIGHLIGHT_STYLE_VALUES: readonly HighlightStyle[] = ["band", "wavy"];
const SANS_FONT_VALUES: readonly SansFont[] = ["atkinson", "gothic", "system"];
const SERIF_FONT_VALUES: readonly SerifFont[] = ["vollkorn", "plex", "system"];
const ADMIN_TAB_VALUES: readonly AdminTab[] = ["passes", "graph", "pools", "prompts", "categories"];
export const AUTO_SAVE_INTERVAL_VALUES: readonly number[] = [2, 5, 10, 15, 30, 60, 120];

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The system colour scheme: the browser knows it, the server has none. */
const systemDark = signal(!import.meta.env.SSR && matchMedia(DARK_QUERY).matches);
if (!import.meta.env.SSR) {
  matchMedia(DARK_QUERY).addEventListener("change", (e) => {
    systemDark.value = e.matches;
  });
}

export interface PreferenceValues {
  readonly debugSidebarOpened: boolean;
  readonly themeOverride: Theme | null;
  readonly viewerFont: string;
  readonly sansFont: SansFont;
  readonly serifFont: SerifFont;
  readonly highlightStyle: HighlightStyle;
  readonly adminTab: AdminTab;
  readonly autoSave: boolean;
  readonly autoSaveInterval: number;
}

function readBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function readText(raw: unknown, fallback: string): string {
  return typeof raw === "string" ? raw : fallback;
}

function readOneOf<V extends string>(raw: unknown, values: readonly V[], fallback: V): V {
  return typeof raw === "string" && values.includes(raw as V) ? (raw as V) : fallback;
}

function readTheme(raw: unknown): Theme | null {
  if (typeof raw !== "string") return null;
  return THEME_VALUES.has(raw as Theme) ? (raw as Theme) : null;
}

function readNumberOneOf(raw: unknown, values: readonly number[], fallback: number): number {
  return typeof raw === "number" && values.includes(raw) ? raw : fallback;
}

/** The cookie payload is user-editable, so every value is validated. */
function readValues(raw: Record<string, unknown>): PreferenceValues {
  return {
    debugSidebarOpened: readBoolean(raw.debugSidebarOpened, false),
    themeOverride: readTheme(raw.themeOverride),
    viewerFont: readText(raw.viewerFont, "font-serif"),
    sansFont: readOneOf(raw.sansFont, SANS_FONT_VALUES, "gothic"),
    serifFont: readOneOf(raw.serifFont, SERIF_FONT_VALUES, "plex"),
    highlightStyle: readOneOf(raw.highlightStyle, HIGHLIGHT_STYLE_VALUES, "wavy"),
    adminTab: readOneOf(raw.adminTab, ADMIN_TAB_VALUES, "pools"),
    autoSave: readBoolean(raw.autoSave, true),
    autoSaveInterval: readNumberOneOf(raw.autoSaveInterval, AUTO_SAVE_INTERVAL_VALUES, 5),
  };
}

export interface Preferences {
  readonly debugSidebarOpened: Signal<boolean>;
  readonly themeOverride: Signal<Theme | null>;
  readonly theme: Signal<Theme>;
  readonly viewerFont: Signal<string>;
  readonly sansFont: Signal<SansFont>;
  readonly serifFont: Signal<SerifFont>;
  readonly highlightStyle: Signal<HighlightStyle>;
  readonly adminTab: Signal<AdminTab>;
  readonly autoSave: Signal<boolean>;
  readonly autoSaveInterval: Signal<number>;
  readonly toggleTheme: () => void;
}

/**
 * The preferences for a request (server) or a page load (browser), read from a cookie string: the
 * request header on the server, `document.cookie` in the browser.
 */
export function preferencesFromCookie(source: string | null | undefined, url: URL): Preferences {
  const values = readValues(readPreferencesCookie(source, url));
  return createPreferences(values, url);
}

function createPreferences(values: PreferenceValues, url: URL): Preferences {
  const debugSidebarOpened = signal(values.debugSidebarOpened);
  const themeOverride = signal(values.themeOverride);
  const viewerFont = signal(values.viewerFont);
  const sansFont = signal(values.sansFont);
  const serifFont = signal(values.serifFont);
  const highlightStyle = signal(values.highlightStyle);
  const adminTab = signal(values.adminTab);
  const autoSave = signal(values.autoSave);
  const autoSaveInterval = signal(values.autoSaveInterval);

  const theme = computed<Theme>(() => themeOverride.value ?? (systemDark.value ? "dark" : "light"));

  function toggleTheme(): void {
    const system: Theme = systemDark.value ? "dark" : "light";
    const target: Theme = theme.value === "dark" ? "light" : "dark";
    themeOverride.value = target === system ? null : target;
  }

  if (!import.meta.env.SSR) {
    let initial = true;
    effect(() => {
      const payload = {
        debugSidebarOpened: debugSidebarOpened.value,
        themeOverride: themeOverride.value,
        viewerFont: viewerFont.value,
        sansFont: sansFont.value,
        serifFont: serifFont.value,
        highlightStyle: highlightStyle.value,
        adminTab: adminTab.value,
        autoSave: autoSave.value,
        autoSaveInterval: autoSaveInterval.value,
      };
      // The first run would write back the values that were just read.
      if (initial) {
        initial = false;
        return;
      }
      writePreferencesCookie(payload, url);
    });

    effect(() => {
      const root = document.documentElement;
      if (themeOverride.value) {
        root.dataset.theme = themeOverride.value;
      } else {
        root.removeAttribute("data-theme");
      }
    });

    effect(() => {
      const root = document.documentElement;
      root.dataset.sansFont = sansFont.value;
      root.dataset.serifFont = serifFont.value;
    });
  }

  return {
    debugSidebarOpened,
    themeOverride,
    theme,
    viewerFont,
    sansFont,
    serifFont,
    highlightStyle,
    adminTab,
    autoSave,
    autoSaveInterval,
    toggleTheme,
  };
}

export const { Provider: PreferencesProvider, use: usePreferences } =
  createModelContext<Preferences>("Preferences");
