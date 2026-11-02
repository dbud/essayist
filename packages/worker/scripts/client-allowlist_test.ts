import { assertEquals, assert } from "@std/assert";
import { test } from "vitest";

import { type BundleChunk, closureOf, patternMatcher, violationsText } from "./client-allowlist.ts";

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

const chunk = (fileName: string, fields: Partial<BundleChunk>): BundleChunk => ({
  fileName,
  imports: [],
  dynamicImports: [],
  moduleIds: [],
  ...fields,
});

const shared = chunk("assets/shared.js", {
  moduleIds: ["/node_modules/lucide-preact/esm/lucide.js"],
  dynamicImports: ["assets/vapor.js"],
});
const mermaidChunk = chunk("assets/mermaid.js", {
  moduleIds: ["/node_modules/mermaid/dist/mermaid.js"],
});
const preview = chunk("assets/preview.js", { dynamicImports: ["assets/mermaid.js"] });
const admin = chunk("assets/admin.js", {
  name: "admin",
  isEntry: true,
  imports: ["assets/shared.js"],
  dynamicImports: ["assets/preview.js"],
});
const editor = chunk("assets/editor.js", {
  name: "editor",
  isEntry: true,
  imports: ["assets/shared.js"],
});

const byFile = new Map(
  [shared, mermaidChunk, preview, admin, editor].map((entry): [string, BundleChunk] => [
    entry.fileName,
    entry,
  ]),
);

test("a page's closure follows static and dynamic import edges", () => {
  const closure = closureOf(admin, byFile)
    .map((entry) => entry.fileName)
    .toSorted();
  assertEquals(closure, [
    "assets/admin.js",
    "assets/mermaid.js",
    "assets/preview.js",
    "assets/shared.js",
  ]);
});

test("another page's closure omits the dynamic chunks it does not own", () => {
  const closure = closureOf(editor, byFile)
    .map((entry) => entry.fileName)
    .toSorted();
  assertEquals(closure, ["assets/editor.js", "assets/shared.js"]);
});

test("the violation report names pages, then packages, then import sites", () => {
  const pullInShared = new Set(["/src/x.tsx", "/a.ts"]);
  const violations: Map<string, Map<string, Set<string>>> = new Map([
    ["admin", new Map([["effect", pullInShared]])],
    [
      "editor",
      new Map([
        ["@effect/ai-openrouter", new Set(["/src/y.tsx"])],
        ["effect", new Set(["/src/x.tsx"])],
      ]),
    ],
  ]);
  assertEquals(
    violationsText(violations),
    "\tadmin\n" +
      "\t\teffect <- /a.ts, /src/x.tsx\n" +
      "\teditor\n" +
      "\t\t@effect/ai-openrouter <- /src/y.tsx\n" +
      "\t\teffect <- /src/x.tsx",
  );
});
