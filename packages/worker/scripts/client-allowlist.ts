/**
 * The client bundle's package allowlist as a vite plugin. The worker package.json declares
 * client.allow (globs shared by every page) and client.pages (per page extras); a first-party
 * import of a package outside a page's list fails the build, transitives pass unlisted, and each
 * failure prints the import chain from a client entry file to the package's modules.
 */

import type { Plugin } from "vite";

export interface ClientManifest {
  allow?: string[];
  pages?: Record<string, string[]>;
}

export interface BundleChunk {
  readonly fileName: string;
  readonly name?: string;
  readonly isEntry?: boolean;
  readonly imports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly moduleIds: readonly string[];
}

/** Compiles a glob pattern: a * matches any characters except "/". */
export function patternToRegExp(pattern: string): RegExp {
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${source}$`);
}

export function patternMatcher(patterns: string[]): (name: string) => boolean {
  const regexps = patterns.map(patternToRegExp);
  return (name) => regexps.some((re) => re.test(name));
}

/** The package name inside a module id: the last node_modules segment, which is the package
 * itself even in pnpm's nested .pnpm layout. */
function pkgName(id: string): string | undefined {
  const marker = "node_modules/";
  const at = id.lastIndexOf(marker);
  if (at === -1) return undefined;
  const [head, scoped] = id.slice(at + marker.length).split("/");
  return head.startsWith("@") ? `${head}/${scoped}` : head;
}

/** The chunks reachable from an entry chunk over import and dynamic import edges; edge
 * targets missing from the bundle are skipped. */
export function closureOf(entry: BundleChunk, byFile: Map<string, BundleChunk>): BundleChunk[] {
  const seen = new Set<string>();
  const reached: BundleChunk[] = [];
  const visit = (chunk: BundleChunk): void => {
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

/** The ids of a package's modules among the chunks. */
function modulesOf(pkg: string, chunks: BundleChunk[]): string[] {
  const ids: string[] = [];
  for (const chunk of chunks) {
    for (const moduleId of chunk.moduleIds) {
      if (pkgName(moduleId) === pkg) ids.push(moduleId);
    }
  }
  return ids;
}

/** The import chain from a client entry file to the package's modules, across the pre-shake
 * importer graph. The graph predates tree shaking, so an importer counts only when the page emitted
 * it; a re-export module is the exception, because shaking removes the module but keeps its edges.
 * Edges into allowed packages end the walk: the transitives belong to the allowed package. The walk
 * reports the deepest first-party module it reaches, and the returned chain omits the removed re-
 * export modules. */
export function importChain(
  modules: string[],
  importersOf: (moduleId: string) => string[],
  allowed: (name: string) => boolean,
  emitted: (moduleId: string) => boolean,
): string[] | undefined {
  const parents = new Map<string, string>();
  const visited = new Set<string>(modules);
  const frontier = [...modules];
  const mayPull = (importer: string): boolean => {
    const pkg = pkgName(importer);
    if (pkg !== undefined && allowed(pkg)) return false;
    return emitted(importer) || importersOf(importer).some(emitted);
  };
  // Pops run in breadth order, so overwriting `top` keeps the deepest first-party module, closest
  // to an entry file.
  let top: string | undefined;
  for (let head = 0; head < frontier.length; head++) {
    const current = frontier[head] ?? "";
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

/** Per page: the import chain of each package outside the page's list. */
type Violations = Map<string, Map<string, string[]>>;

function pkgsOf(chunks: BundleChunk[]): Set<string> {
  const names = new Set<string>();
  for (const chunk of chunks) {
    for (const moduleId of chunk.moduleIds) {
      const pkg = pkgName(moduleId);
      if (pkg !== undefined) names.add(pkg);
    }
  }
  return names;
}

/** A module id as the report reads it: first-party ids relative to the workspace root, a
 * package's ids as the package name plus what follows its node_modules segment. */
export function pathText(id: string): string {
  const pkg = pkgName(id);
  if (pkg === undefined) {
    const cut = id.indexOf("essayist/");
    return cut === -1 ? id : id.slice(cut + "essayist/".length);
  }
  const at = id.lastIndexOf("node_modules/");
  return `${pkg}${id.slice(at + "node_modules/".length + pkg.length)}`;
}

export function violationsText(violations: Violations): string {
  return [...violations]
    .map(
      ([page, rows]) =>
        `\t${page}\n` +
        [...rows]
          .map(
            ([pkg, chain]) =>
              `\t\t${pkg}\n` +
              [...chain]
                .toReversed()
                .map((id) => `\t\t\t${pathText(id)}`)
                .join("\n"),
          )
          .toSorted()
          .join("\n"),
    )
    .toSorted()
    .join("\n");
}

export function clientAllowlist(manifest: ClientManifest): Plugin {
  const isShared = patternMatcher(manifest.allow ?? []);
  const pages = manifest.pages ?? {};
  return {
    name: "essayist:client-allowlist",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment?.name !== "client") return;

      const byFile = new Map<string, BundleChunk>();
      const entryOf = new Map<string, BundleChunk>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        byFile.set(output.fileName, output);
        if (output.isEntry && output.name !== undefined) {
          entryOf.set(output.name, output);
        }
      }

      const unknownPages = Object.keys(pages).filter((page) => !entryOf.has(page));
      if (unknownPages.length > 0) {
        this.error(
          `client bundle: pages lists ${unknownPages.toSorted().join(", ")} ` +
            `name no client entry chunk (${[...entryOf.keys()].toSorted().join(", ")})`,
        );
      }

      const importersOf = (moduleId: string): string[] => {
        const info = this.getModuleInfo(moduleId);
        return [...(info?.importers ?? []), ...(info?.dynamicImporters ?? [])];
      };

      const violations: Violations = new Map();
      for (const [page, entry] of entryOf) {
        const pageMatcher = patternMatcher(pages[page] ?? []);
        const allowed = (name: string): boolean => isShared(name) || pageMatcher(name);
        const closure = closureOf(entry, byFile);
        const emitted = new Set(closure.flatMap((chunk) => [...chunk.moduleIds]));
        for (const pkg of pkgsOf(closure)) {
          if (allowed(pkg)) continue;
          const chain = importChain(modulesOf(pkg, closure), importersOf, allowed, (moduleId) =>
            emitted.has(moduleId),
          );
          if (chain === undefined) continue;
          const rows = violations.get(page) ?? new Map<string, string[]>();
          rows.set(pkg, chain);
          violations.set(page, rows);
        }
      }

      if (violations.size === 0) return;
      this.error(
        `client bundle: packages outside client.allow reach the client:\n` +
          violationsText(violations),
      );
    },
  };
}
