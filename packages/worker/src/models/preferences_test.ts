import { expect, test } from "vitest";
import { preferencesFromCookie } from "./preferences.ts";

const url = new URL("http://localhost:5173/");

function cookie(values: unknown): string {
  return `prefs=${encodeURIComponent(JSON.stringify(values))}`;
}

test("reads the values from the cookie", () => {
  const preferences = preferencesFromCookie(
    cookie({
      debugSidebarOpened: true,
      themeOverride: "dark",
      viewerFont: "font-mono",
      sansFont: "atkinson",
      serifFont: "vollkorn",
      highlightStyle: "band",
    }),
    url,
  );
  expect(preferences.debugSidebarOpened.value).toBe(true);
  expect(preferences.themeOverride.value).toBe("dark");
  expect(preferences.theme.value).toBe("dark");
  expect(preferences.viewerFont.value).toBe("font-mono");
  expect(preferences.sansFont.value).toBe("atkinson");
  expect(preferences.serifFont.value).toBe("vollkorn");
  expect(preferences.highlightStyle.value).toBe("band");
});

test("falls back to the defaults without a cookie", () => {
  const preferences = preferencesFromCookie(null, url);
  expect(preferences.debugSidebarOpened.value).toBe(false);
  expect(preferences.themeOverride.value).toBe(null);
  expect(preferences.viewerFont.value).toBe("font-serif");
  expect(preferences.sansFont.value).toBe("gothic");
  expect(preferences.serifFont.value).toBe("plex");
  expect(preferences.highlightStyle.value).toBe("wavy");
});

test("falls back to the defaults for a malformed value", () => {
  const preferences = preferencesFromCookie(
    cookie({
      debugSidebarOpened: "yes",
      themeOverride: "neon",
      sansFont: "comic",
      highlightStyle: 3,
    }),
    url,
  );
  expect(preferences.debugSidebarOpened.value).toBe(false);
  expect(preferences.themeOverride.value).toBe(null);
  expect(preferences.sansFont.value).toBe("gothic");
  expect(preferences.highlightStyle.value).toBe("wavy");
});
