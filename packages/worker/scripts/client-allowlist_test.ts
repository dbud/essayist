import { assert } from "@std/assert";
import { test } from "vitest";

import { patternMatcher } from "./client-allowlist.ts";

const families = ["@fontsource/*", "@fontsource-variable/*", "@lexical/*", "marked"];

const matches = patternMatcher(families);

test("families match the packages of their scope", () => {
  assert(matches("@fontsource/ibm-plex-serif"));
  assert(matches("@fontsource-variable/atkinson-hyperlegible-next"));
  assert(matches("@lexical/clipboard"));
  assert(matches("marked"));
});

test("globs do not cross package boundaries", () => {
  assert(!matches("@fontsourceinjectedmalware"));
  assert(!matches("@fontsourceinjectedmalware/fake"));
  assert(!matches("@fontsourceinjectedmalware/@fontsource/fake"));
  assert(!matches("@fontsource"));
  assert(!matches("marked/esm"));
  assert(!matches("@fontsource/fake/suffix"));
});
