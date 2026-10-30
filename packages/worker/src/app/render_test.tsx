import { render } from "preact-render-to-string";
import { expect, test } from "vitest";

import { preferencesFromCookie } from "#/models/preferences.ts";

import { Document } from "./render.tsx";

const url = new URL("http://localhost:5173/");

function renderDocument(values: unknown): string {
  const preferences = preferencesFromCookie(
    `prefs=${encodeURIComponent(JSON.stringify(values))}`,
    url,
  );
  return render(
    <Document
      title="test"
      sentry={{ dsn: "https://dsn.invalid/1" }}
      state={{}}
      preferences={preferences}
    >
      <p>content</p>
    </Document>,
  );
}

test("renders the theme and font attributes on the html element", () => {
  const html = renderDocument({
    themeOverride: "dark",
    sansFont: "atkinson",
    serifFont: "vollkorn",
  });
  expect(html).toContain('data-theme="dark"');
  expect(html).toContain('data-sans-font="atkinson"');
  expect(html).toContain('data-serif-font="vollkorn"');
});

test("omits the theme attribute without an override", () => {
  const html = renderDocument({ themeOverride: null });
  expect(html).not.toContain("data-theme");
});
