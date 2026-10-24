// @vitest-environment happy-dom
import { expect, test } from "vitest";
import {
  preferencesCookieName,
  readPreferencesCookie,
  writePreferencesCookie,
} from "./preferencesCookie.ts";

const url = new URL("http://localhost:5173/");

test("reads the payload from a cookie string", () => {
  const source = `other=1; ${preferencesCookieName(url)}=${encodeURIComponent(
    JSON.stringify({ debugSidebarOpened: true }),
  )}; another=2`;
  expect(readPreferencesCookie(source, url)).toEqual({
    debugSidebarOpened: true,
  });
});

test("reads an empty payload when the cookie is absent or malformed", () => {
  const name = preferencesCookieName(url);
  expect(readPreferencesCookie(null, url)).toEqual({});
  expect(readPreferencesCookie("other=1", url)).toEqual({});
  expect(readPreferencesCookie(`${name}=not-json`, url)).toEqual({});
  expect(
    readPreferencesCookie(`${name}=${encodeURIComponent("[1]")}`, url),
  ).toEqual({});
});

test("round trips through the document cookie", () => {
  writePreferencesCookie({ debugSidebarOpened: true }, url);
  expect(readPreferencesCookie(document.cookie, url)).toEqual({
    debugSidebarOpened: true,
  });
});
