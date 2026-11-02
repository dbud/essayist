/**
 * The client bundle's package allowlist as a vite plugin. The worker package.json declares
 * client.allow (globs shared by every page) and client.pages (per page extras); a first-party
 * import of a package outside a page's list fails the build, transitives pass unlisted.
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

/** Per page: by package, the first-party sites importing it. */
type Violations = Map<string, Map<string, Set<string>>>;

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

export function violationsText(violations: Violations): string {
  return [...violations]
    .map(
      ([page, rows]) =>
        `\t${page}\n` +
        [...rows]
          .map(([pkg, sites]) => `\t\t${pkg} <- ${[...sites].toSorted().join(", ")}`)
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

      const firstPartySites = (pkg: string, closure: BundleChunk[]): string[] => {
        const sites = new Set<string>();
        for (const chunk of closure) {
          for (const moduleId of chunk.moduleIds) {
            if (pkgName(moduleId) !== pkg) continue;
            const info = this.getModuleInfo(moduleId);
            for (const importer of [
              ...(info?.importers ?? []),
              ...(info?.dynamicImporters ?? []),
            ]) {
              if (pkgName(importer) !== undefined) continue;
              sites.add(importer);
            }
          }
        }
        return [...sites];
      };

      const violations: Violations = new Map();
      for (const [page, entry] of entryOf) {
        const pageMatcher = patternMatcher(pages[page] ?? []);
        const closure = closureOf(entry, byFile);
        for (const pkg of pkgsOf(closure)) {
          if (isShared(pkg) || pageMatcher(pkg)) continue;
          const sites = firstPartySites(pkg, closure);
          if (sites.length === 0) continue;
          const rows = violations.get(page) ?? new Map<string, Set<string>>();
          const merged = rows.get(pkg) ?? new Set<string>();
          for (const site of sites) merged.add(site);
          rows.set(pkg, merged);
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
