import { expect, test } from "vitest";
import { preferencesFromCookie } from "./preferences.ts";

const url = new URL("http://localhost:5173/");

function cookie(values: unknown): string {
  return `prefs=${encodeURIComponent(JSON.stringify(values))}`;
}

test("reads the values from the cookie", () => {
  const preferences = preferencesFromCookie(
    cookie({ debugSidebarOpened: true }),
    url,
  );
  expect(preferences.debugSidebarOpened.value).toBe(true);
});

test("falls back to the defaults without a cookie", () => {
  const preferences = preferencesFromCookie(null, url);
  expect(preferences.debugSidebarOpened.value).toBe(false);
});

test("falls back to the defaults for a malformed value", () => {
  const preferences = preferencesFromCookie(
    cookie({ debugSidebarOpened: "yes" }),
    url,
  );
  expect(preferences.debugSidebarOpened.value).toBe(false);
});
