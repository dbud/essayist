import type {
  FsRouteFileNoMod,
  UniqueNamer,
} from "jsr:@fresh/core@^2.0.0/internal-dev";
import * as path from "jsr:@std/path@1";
import type { ImportCheck } from "./plugins/verify_imports.ts";

export const JS_REG = /\.([tj]sx?|[mc]?[tj]s)(\?.*)?$/;
export const JSX_REG = /\.[tj]sx(\?.*)?$/;

export function pathWithRoot(fileOrDir: string, root?: string): string {
  if (path.isAbsolute(fileOrDir)) return fileOrDir;

  if (root === undefined) {
    return path.join(Deno.cwd(), fileOrDir);
  }

  if (path.isAbsolute(root)) return path.join(root, fileOrDir);

  return path.join(Deno.cwd(), root, fileOrDir);
}

export interface FreshState {
  namer: UniqueNamer;
  root: string;
  serverEntry: string;
  islandDir: string;
  routeDir: string;
  dev: boolean;
  islands: Map<string, { name: string; chunk: string | null }>;
  // deno-lint-ignore no-explicit-any
  routes: FsRouteFileNoMod<any>[];
  clientOutDir: string;
  serverOutDir: string;
}

export interface ClientSnapshot {
  entry: string;
}

/** Configuration options for Fresh when using the Vite plugin */
export interface FreshViteConfig {
  /** Path to main server entry file. Default: `main.ts` */
  serverEntry?: string;
  /** Path to main client entry file. Default: `client.ts` */
  clientEntry?: string;
  /** Path to islands directory. Default: `./islands` */
  islandsDir?: string;
  /** Path to routes directory. Default: `./routes` */
  routeDir?: string;
  /**
   * The directory (or directories) to serve static files from.
   * When multiple directories are specified, they are searched in order
   * and the first match wins. Default: `"static"`
   */
  staticDir?: string | string[];
  /**
   * Ignore file paths matching any of the provided regexes when
   * crawling the islands and routes directories.
   */
  ignore?: RegExp[];
  /**
   * Treat these specifiers as island files. This is used to declare
   * islands from remote packages.
   */
  islandSpecifiers?: string[];
  /**
   * A list of checks that will be performed for imports.
   *
   * Can be used to warn or error when certain imports exist in
   * server or client code. Useful to enforce that some dependencies
   * are not imported in Islands running in the browser.
   */
  checkImports?: ImportCheck[];
  /**
   * Vite environment names that should skip the fresh transform
   * patches (babel). Useful for custom environments that only bundle
   * first-party ESM code, e.g. a web worker environment.
   */
  environmentsWithoutPatches?: string[];
}

export type ResolvedFreshViteConfig = Required<
  Omit<
    FreshViteConfig,
    "islandSpecifiers" | "staticDir" | "environmentsWithoutPatches"
  >
> & {
  staticDir: string[];
  islandSpecifiers: Map<string, string>;
  environmentsWithoutPatches: string[];
  namer: UniqueNamer;
};
