/**
 * A Vite plugin that fails the build when the client bundle contains a package it isn't allowed to.
 *
 * The limits come from the worker's package.json: - client.allow: globs of packages allowed
 * anywhere in the client bundle. - client.budgets: extra globs per chunk, keyed by chunk name. A
 * chunk's budget is client.allow plus its own entry here.
 *
 * The check runs after the build, on the emitted chunk graph. Two kinds of chunk get a budget of
 * their own: every entry chunk (one per page) and every chunk named in client.budgets (a lazily
 * loaded module). A budget covers its chunk plus the chunks that chunk downloads, minus any chunk
 * that has a budget of its own or was already charged to an earlier budget. This keeps a lazy
 * module's packages out of the check of the page that loads it.
 *
 * A package outside its budget fails the build. The error shows the chain of imports that leads
 * from first-party code to the package, one module per line, the package's module first. A page
 * that statically imports a lazy budget chunk also fails, because the chunk would then download
 * with the page.
 */

import { resolve } from "node:path";

import type { Plugin } from "vite";

export interface ClientManifest {
  allow?: string[];
  budgets?: Record<string, string[]>;
}

export interface Chunk {
  readonly fileName: string;
  readonly name?: string;
  readonly isEntry?: boolean;
  readonly imports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly moduleIds: readonly string[];
}

/** Turns a glob into a RegExp. The only wildcard is `*`, which matches any run of characters
 * except "/". */
export function patternToRegExp(pattern: string): RegExp {
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${source}$`);
}

/** Returns a function that tells whether a name matches any of the globs. */
export function patternMatcher(patterns: string[]): (name: string) => boolean {
  const regexps = patterns.map(patternToRegExp);
  return (name) => regexps.some((re) => re.test(name));
}

/** The package a module id belongs to, or undefined for first-party modules. It reads the last
 * node_modules/ segment of the id, so pnpm's nested .pnpm paths still give the real package. */
function pkgName(id: string): string | undefined {
  const marker = "node_modules/";
  const at = id.lastIndexOf(marker);
  if (at === -1) return undefined;
  const [head, scoped] = id.slice(at + marker.length).split("/");
  return head.startsWith("@") ? `${head}/${scoped}` : head;
}

/** Every chunk reachable from `entry` (itself included) by following static and dynamic imports.
 * Imports that point at a file missing from the bundle are skipped. */
export function closureOf(entry: Chunk, byFile: Map<string, Chunk>): Chunk[] {
  const seen = new Set<string>();
  const reached: Chunk[] = [];
  const visit = (chunk: Chunk): void => {
    if (seen.has(chunk.fileName)) return;
    seen.add(chunk.fileName);
    reached.push(chunk);
    for (const file of [...chunk.imports, ...chunk.dynamicImports]) {
      const next = byFile.get(file);
      if (next !== undefined) visit(next);
    }
  };
  visit(entry);
  return reached;
}

/** A chunk that has a budget, and the chunks charged to that budget (the chunk itself included). */
export interface Budget {
  readonly chunk: Chunk;
  readonly closure: Chunk[];
}

/** Splits the chunks reachable from an entry into a group per budget.
 *
 * The entry is the first budget. Its group is built by following imports and dynamic imports. The
 * walk does not enter a chunk that is an entry or is named in client.budgets. That chunk is queued
 * and gets its own group later. A chunk reachable from several budgets is charged to whichever
 * budget claims it first, so each later group holds only chunks no earlier group took.
 *
 * Returns the budgets in the order they were found, the entry first. */
export function budgetClosures(
  entry: Chunk,
  byFile: Map<string, Chunk>,
  isBudget: (chunk: Chunk) => boolean,
): Budget[] {
  const queue: Chunk[] = [entry];
  const queued = new Set<string>([entry.fileName]);
  const claimed = new Set<string>();
  const budgets: Budget[] = [];
  const claim = (owner: Chunk): Chunk[] => {
    claimed.add(owner.fileName);
    const closure = [owner];
    const waiting = [owner];
    for (let head = 0; head < waiting.length; head++) {
      const current = waiting[head] ?? owner;
      for (const file of [...current.imports, ...current.dynamicImports]) {
        const target = byFile.get(file);
        if (target === undefined || claimed.has(target.fileName)) continue;
        if (isBudget(target)) {
          if (!queued.has(target.fileName)) {
            queued.add(target.fileName);
            queue.push(target);
          }
          continue;
        }
        claimed.add(target.fileName);
        closure.push(target);
        waiting.push(target);
      }
    }
    return closure;
  };
  for (let head = 0; head < queue.length; head++) {
    const owner = queue[head] ?? entry;
    budgets.push({ chunk: owner, closure: claim(owner) });
  }
  return budgets;
}

/** The ids of all modules in `chunks` that belong to the package `pkg`. */
function modulesOf(pkg: string, chunks: Chunk[]): string[] {
  const ids: string[] = [];
  for (const chunk of chunks) {
    for (const moduleId of chunk.moduleIds) {
      if (pkgName(moduleId) === pkg) ids.push(moduleId);
    }
  }
  return ids;
}

/** Finds the chain of imports that leads from first-party code to a package's modules.
 *
 * It starts at the package's modules and walks upward through their importers, breadth first. The
 * importer graph comes from Rollup before tree shaking, so it can list importers whose code was
 * dropped from the output. An importer is followed only if it was emitted itself or at least one
 * of its own importers was emitted. The second case covers a re-export module that tree shaking
 * removed while its import edges remain.
 *
 * The walk never goes through a module of an allowed package. Whatever an allowed package pulls
 * in is blamed on that package, not reported. If every path to the package runs through allowed
 * packages, there is no chain and the result is undefined.
 *
 * Of the first-party modules the walk ends at, the last found wins: it is farthest from the
 * package, so closest to an entry file. The returned chain runs from that module to a module of the
 * package and omits modules that were not emitted. */
export function importChain(
  modules: string[],
  importersOf: (moduleId: string) => string[],
  allowed: (name: string) => boolean,
  emitted: (moduleId: string) => boolean,
): string[] | undefined {
  const parents = new Map<string, string>();
  const visited = new Set<string>(modules);
  // `frontier` is also the queue. A for...of loop over an array visits elements pushed during the
  // loop, which keeps the walk breadth first.
  const frontier = [...modules];
  const mayPull = (importer: string): boolean => {
    const pkg = pkgName(importer);
    if (pkg !== undefined && allowed(pkg)) return false;
    return emitted(importer) || importersOf(importer).some(emitted);
  };
  // A first-party module with no importer left to follow is an end of the walk. Later ends are
  // farther from the package, so overwriting `top` keeps the farthest end.
  let top: string | undefined;
  for (const current of frontier) {
    let pushed = false;
    for (const importer of importersOf(current)) {
      if (!mayPull(importer) || visited.has(importer)) continue;
      visited.add(importer);
      parents.set(importer, current);
      frontier.push(importer);
      pushed = true;
    }
    if (!pushed && pkgName(current) === undefined) top = current;
  }
  if (top === undefined) return undefined;
  const chain: string[] = [];
  for (let step: string | undefined = top; step !== undefined; step = parents.get(step)) {
    if (emitted(step)) chain.push(step);
  }
  return chain;
}

/** A violation: the budget that was broken, the package that's missing, and the import chain
 * from a first-party module to a module of that package. */
export interface Violation {
  readonly budget: string;
  readonly pkg: string;
  readonly chain: string[];
}

/** The names of all packages that have a module in `chunks`. */
function pkgsOf(chunks: Chunk[]): Set<string> {
  const names = new Set<string>();
  for (const chunk of chunks) {
    for (const moduleId of chunk.moduleIds) {
      const pkg = pkgName(moduleId);
      if (pkg !== undefined) names.add(pkg);
    }
  }
  return names;
}

/** A module id as shown in the error. First-party ids are cut to the part after the workspace
 * root; other ids, like a chunk file's "assets/name.js", are left alone. Package modules show the
 * package name plus the path inside it. */
export function pathText(id: string, workspaceRoot: string): string {
  const pkg = pkgName(id);
  if (pkg === undefined) {
    const marker = `${workspaceRoot}/`;
    return id.startsWith(marker) ? id.slice(marker.length) : id;
  }
  const at = id.lastIndexOf("node_modules/");
  return `${pkg}${id.slice(at + "node_modules/".length + pkg.length)}`;
}

/** Finds static imports that load a lazy budget chunk along with the page, and returns an
 * "importer -> chunk" line for each. A lazy chunk is meant to download on demand. A static import
 * makes it download with the page, so the build fails. Entry chunks are never reported, since each
 * has its own budget. */
export function eagerOf(
  reach: Chunk[],
  byFile: Map<string, Chunk>,
  isBudget: (chunk: Chunk) => boolean,
  workspaceRoot: string,
): string[] {
  return reach.flatMap((chunk) =>
    chunk.imports.flatMap((file) => {
      const target = byFile.get(file);
      if (target === undefined || target.isEntry === true || !isBudget(target)) return [];
      return [`${pathText(chunk.fileName, workspaceRoot)} -> ${target.name ?? target.fileName}`];
    }),
  );
}

/** Formats violations for the error message, sorted by budget and then package. Each violation
 * prints as the budget, the package, then the chain with the package's module first. */
export function violationsText(rows: Violation[], workspaceRoot: string): string {
  return [...rows]
    .toSorted((a, b) =>
      a.budget === b.budget ? (a.pkg < b.pkg ? -1 : 1) : a.budget < b.budget ? -1 : 1,
    )
    .map(
      (row) =>
        `\t${row.budget}\n` +
        `\t\t${row.pkg}\n` +
        [...row.chain]
          .toReversed()
          .map((id) => `\t\t\t${pathText(id, workspaceRoot)}`)
          .join("\n"),
    )
    .join("\n");
}

export function clientAllowlist(manifest: ClientManifest): Plugin {
  const baseAllow = patternMatcher(manifest.allow ?? []);
  const budgets = manifest.budgets ?? {};
  const budgetKeys = new Set(Object.keys(budgets));
  // The workspace root is the directory two levels above the worker package, named whatever
  // the repo is checked out as on the build machine. Taken from the resolved config rather than
  // import.meta.url, because the build inlines this plugin into a temporary copy of the config.
  let workspaceRoot = "";
  return {
    name: "essayist:client-allowlist",
    apply: "build",
    configResolved(config) {
      workspaceRoot = resolve(config.root, "..", "..");
    },
    generateBundle(_options, bundle) {
      if (this.environment?.name !== "client") return;

      const byFile = new Map<string, Chunk>();
      const entries = new Map<string, Chunk>();
      const byName = new Map<string, Chunk>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        byFile.set(output.fileName, output);
        if (output.name === undefined) continue;
        if (!byName.has(output.name)) byName.set(output.name, output);
        if (output.isEntry) entries.set(output.name, output);
      }

      const unknown = [...budgetKeys].filter((key) => !byName.has(key));
      if (unknown.length > 0) {
        this.error(
          `client bundle: budgets lists ${unknown.toSorted().join(", ")} ` +
            `name no chunk (${[...byName.keys()].toSorted().join(", ")})`,
        );
      }

      const importersOf = (moduleId: string): string[] => {
        const info = this.getModuleInfo(moduleId);
        return [...(info?.importers ?? []), ...(info?.dynamicImporters ?? [])];
      };

      const isBudget = (chunk: Chunk): boolean =>
        chunk.isEntry === true || (chunk.name !== undefined && budgetKeys.has(chunk.name));

      const rows: Violation[] = [];
      const reported = new Set<string>();
      const check = (name: string, extras: string[], closure: Chunk[]): void => {
        const matcher = patternMatcher(extras);
        const allowed = (pkg: string): boolean => baseAllow(pkg) || matcher(pkg);
        const emitted = new Set(closure.flatMap((chunk) => [...chunk.moduleIds]));
        for (const pkg of pkgsOf(closure)) {
          if (allowed(pkg)) continue;
          const chain = importChain(modulesOf(pkg, closure), importersOf, allowed, (moduleId) =>
            emitted.has(moduleId),
          );
          if (chain === undefined) continue;
          const key = `${name}\t${pkg}\t${chain.join("\t")}`;
          if (!reported.has(key)) {
            reported.add(key);
            rows.push({ budget: name, pkg, chain });
          }
        }
      };

      for (const [page, entry] of entries) {
        const [own, ...further] = budgetClosures(entry, byFile, isBudget);
        if (own === undefined) continue;
        const eager = eagerOf(own.closure, byFile, isBudget, workspaceRoot);
        if (eager.length > 0) {
          this.error(
            `client bundle: page ${page} statically downloads budget chunks: ${eager.join(", ")}`,
          );
        }
        check(page, budgets[page] ?? [], own.closure);
        for (const budget of further) {
          const name = budget.chunk.name ?? page;
          check(name, budgets[name] ?? [], budget.closure);
        }
      }

      if (rows.length === 0) return;
      this.error(
        `client bundle: packages outside their budget reach the client:\n${violationsText(rows, workspaceRoot)}`,
      );
    },
  };
}
