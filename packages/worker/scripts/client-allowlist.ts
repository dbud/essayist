/**
 * The client bundle's package allowlist as a vite plugin: the worker package.json lists glob
 * patterns under client.allow (a * matches any characters except "/"). First-party imports of a
 * package outside the list fail the build; transitives of an allowed package pass unlisted.
 */

import type { Plugin } from "vite";

/** Compiles one glob pattern: * matches any characters except "/". */
export function patternToRegExp(pattern: string): RegExp {
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${source}$`);
}

/** Compiles the pattern list once and returns a matcher over package names. */
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

/** Fails the build when a package outside `patterns` is imported directly by first-party
 * code, naming each package and the sites that pulled it in. */
export function clientAllowlist(patterns: string[]): Plugin {
  const isAllowed = patternMatcher(patterns);
  return {
    name: "essayist:client-allowlist",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment?.name !== "client") return;

      const importersOf = new Map<string, Set<string>>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const moduleId of output.moduleIds) {
          const name = pkgName(moduleId);
          if (name === undefined || isAllowed(name)) continue;
          const info = this.getModuleInfo(moduleId);
          const firstPartySites = [
            ...(info?.importers ?? []),
            ...(info?.dynamicImporters ?? []),
          ].filter((importer) => pkgName(importer) === undefined);
          if (firstPartySites.length === 0) continue;
          const bySites = importersOf.get(name) ?? new Set<string>();
          for (const site of firstPartySites) bySites.add(site);
          importersOf.set(name, bySites);
        }
      }

      if (importersOf.size > 0) {
        const lines = [...importersOf]
          .map(([name, sites]) => `\t${name} <- ${[...sites].toSorted().join(", ")}`)
          .join("\n");
        this.error(`client bundle: packages outside client.allow reach the client:\n${lines}`);
      }
    },
  };
}
