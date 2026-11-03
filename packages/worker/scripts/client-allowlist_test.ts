import { assertEquals, assert } from "@std/assert";
import { test } from "vitest";

import {
  type Chunk,
  budgetClosures,
  closureOf,
  eagerOf,
  importChain,
  pathText,
  patternMatcher,
  type Violation,
  violationsText,
} from "./client-allowlist.ts";

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

const chunk = (fileName: string, fields: Partial<Chunk>): Chunk => ({
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
  [shared, mermaidChunk, preview, admin, editor].map((entry): [string, Chunk] => [
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

const budgetFixture = () => {
  const entry = chunk("assets/page.js", {
    name: "editor",
    isEntry: true,
    imports: ["assets/shared.js", "assets/sidebar.js"],
  });
  const sharedChunk = chunk("assets/shared.js", {});
  const sidebarOnly = chunk("assets/sidebaronly.js", {});
  const sidebarChunk = chunk("assets/sidebar.js", {
    name: "DebugSidebarContent",
    imports: ["assets/shared.js", "assets/sidebaronly.js"],
    dynamicImports: ["assets/inner.js"],
  });
  const innerChunk = chunk("assets/inner.js", {
    name: "DebugInner",
    imports: ["assets/inneronly.js"],
  });
  const innerOnly = chunk("assets/inneronly.js", {});
  const graph = new Map(
    [entry, sharedChunk, sidebarOnly, sidebarChunk, innerChunk, innerOnly].map(
      (part): [string, Chunk] => [part.fileName, part],
    ),
  );
  const isBudget = (part: Chunk): boolean =>
    part.isEntry === true || part.name === "DebugSidebarContent" || part.name === "DebugInner";
  return { entry, graph, isBudget };
};

const fileNames = (chunks: Chunk[] | undefined): string[] =>
  (chunks ?? []).map((part) => part.fileName).toSorted();

test("budget closures start at the entry and give shared chunks to nearer budgets", () => {
  const { entry, graph, isBudget } = budgetFixture();
  const budgets = budgetClosures(entry, graph, isBudget);
  assertEquals(
    budgets.map((budget) => budget.chunk.name ?? budget.chunk.fileName),
    ["editor", "DebugSidebarContent", "DebugInner"],
  );
  assertEquals(fileNames(budgets[0]?.closure), ["assets/page.js", "assets/shared.js"]);
  assertEquals(fileNames(budgets[1]?.closure), ["assets/sidebar.js", "assets/sidebaronly.js"]);
  assertEquals(fileNames(budgets[2]?.closure), ["assets/inner.js", "assets/inneronly.js"]);
});

test("budget closures together cover the entry's whole closure", () => {
  const { entry, graph, isBudget } = budgetFixture();
  const covered = new Set<string>();
  for (const budget of budgetClosures(entry, graph, isBudget)) {
    for (const part of budget.closure) covered.add(part.fileName);
  }
  assertEquals(
    [...covered].toSorted(),
    closureOf(entry, graph)
      .map((part) => part.fileName)
      .toSorted(),
  );
});

test("static imports of budget chunks report eager", () => {
  const { entry, graph, isBudget } = budgetFixture();
  const [own] = budgetClosures(entry, graph, isBudget);
  assertEquals(eagerOf(own?.closure ?? [], graph, isBudget, "/x/essayist"), [
    "assets/page.js -> DebugSidebarContent",
  ]);
});

test("the report shortens module ids to readable paths", () => {
  assertEquals(
    pathText("/x/essayist/packages/core/src/ids.ts", "/x/essayist"),
    "packages/core/src/ids.ts",
  );
  assertEquals(
    pathText("/store/node_modules/.pnpm/effect@4.1.1/node_modules/effect/dist/index.js", "/x"),
    "effect/dist/index.js",
  );
  assertEquals(
    pathText("/store/node_modules/.pnpm/w@1.0.0/node_modules/@scope/w/mod.js", "/x/essayist"),
    "@scope/w/mod.js",
  );
  assertEquals(pathText("somewhere/else/src/ids.ts", "/x/essayist"), "somewhere/else/src/ids.ts");
});

test("the violation report nests the reversed chain under each budget", () => {
  const rows: Violation[] = [
    {
      budget: "DebugSidebarContent",
      pkg: "marked",
      chain: [
        "/x/essayist/worker/src/utils/renderMarkdown.ts",
        "/x/node_modules/marked/lib/marked.esm.js",
      ],
    },
    {
      budget: "admin",
      pkg: "effect",
      chain: ["/x/essayist/core/src/pull.ts", "/x/node_modules/effect/dist/Context.js"],
    },
    {
      budget: "editor",
      pkg: "effect",
      chain: [
        "/x/essayist/core/ids.ts",
        "/x/node_modules/effect/dist/index.js",
        "/x/node_modules/effect/dist/Context.js",
      ],
    },
  ];
  assertEquals(
    violationsText(rows, "/x/essayist"),
    "\tDebugSidebarContent\n" +
      "\t\tmarked\n" +
      "\t\t\tmarked/lib/marked.esm.js\n" +
      "\t\t\tworker/src/utils/renderMarkdown.ts\n" +
      "\tadmin\n" +
      "\t\teffect\n" +
      "\t\t\teffect/dist/Context.js\n" +
      "\t\t\tcore/src/pull.ts\n" +
      "\teditor\n" +
      "\t\teffect\n" +
      "\t\t\teffect/dist/Context.js\n" +
      "\t\t\teffect/dist/index.js\n" +
      "\t\t\tcore/ids.ts",
  );
});

test("import chains walk through re-export modules and cycles", () => {
  // Tree shaking removed the re-export file; the chain still runs through it and omits it.
  const emittedIds = new Set([
    "node_modules/effect/dist/Context.js",
    "node_modules/effect/dist/internal/core.js",
  ]);
  const importersOf = (moduleId: string): string[] => {
    if (moduleId === "node_modules/effect/dist/Context.js") {
      return ["node_modules/effect/dist/index.js", "node_modules/effect/dist/internal/core.js"];
    }
    if (
      moduleId === "node_modules/effect/dist/index.js" ||
      moduleId === "node_modules/effect/dist/internal/core.js"
    ) {
      return ["core/src/ids.ts", "node_modules/effect/dist/Context.js"];
    }
    return [];
  };
  const emitted = (moduleId: string): boolean =>
    emittedIds.has(moduleId) || moduleId === "core/src/ids.ts";
  const chain = importChain(
    ["node_modules/effect/dist/Context.js"],
    importersOf,
    () => false,
    emitted,
  );
  assertEquals(chain, ["core/src/ids.ts", "node_modules/effect/dist/Context.js"]);
});

test("a direct first-party importer gives a two module chain", () => {
  const importersOf = (moduleId: string): string[] =>
    moduleId === "node_modules/mermaid/dist/mermaid.core.mjs"
      ? ["src/components/admin/PassGraph.tsx"]
      : [];
  const chain = importChain(
    ["node_modules/mermaid/dist/mermaid.core.mjs"],
    importersOf,
    () => false,
    () => true,
  );
  assertEquals(chain, [
    "src/components/admin/PassGraph.tsx",
    "node_modules/mermaid/dist/mermaid.core.mjs",
  ]);
});

test("chains into allowed packages end the walk", () => {
  // mermaid is allowed here, so dompurify pulled by it is a transitive of an allowed package.
  const importersOf = (moduleId: string): string[] =>
    moduleId === "node_modules/dompurify/dist/purify.es.mjs"
      ? ["node_modules/mermaid/dist/mermaid.core.mjs"]
      : [];
  const chain = importChain(
    ["node_modules/dompurify/dist/purify.es.mjs"],
    importersOf,
    (name) => name === "mermaid",
    () => true,
  );
  assertEquals(chain, undefined);
});

test("the report skips a first-party importer tree shaking dropped", () => {
  // auth_d1.ts imports effect, but tree shaking drops it from the client build.
  const importersOf = (moduleId: string): string[] =>
    moduleId === "node_modules/effect/dist/Context.js" ? ["packages/core/src/auth/auth_d1.ts"] : [];
  const chain = importChain(
    ["node_modules/effect/dist/Context.js"],
    importersOf,
    () => false,
    () => false,
  );
  assertEquals(chain, undefined);
});

test("the chain climbs past first-party hops to the entry file", () => {
  const importersOf = new Map<string, string[]>([
    ["node_modules/effect/dist/Context.js", ["packages/core/src/ids.ts"]],
    [
      "packages/core/src/ids.ts",
      ["packages/core/src/marks/resolver.ts", "client/editor/models.ts"],
    ],
    ["client/editor/models.ts", ["client/editor.tsx"]],
  ]);
  const chain = importChain(
    ["node_modules/effect/dist/Context.js"],
    (moduleId) => importersOf.get(moduleId) ?? [],
    () => false,
    () => true,
  );
  assertEquals(chain, [
    "client/editor.tsx",
    "client/editor/models.ts",
    "packages/core/src/ids.ts",
    "node_modules/effect/dist/Context.js",
  ]);
});
