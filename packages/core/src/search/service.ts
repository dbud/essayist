/**
 * Cross-file text search as an Effect service: regex and literal search
 * over the files of one workspace, backed by the Files service.
 */

import { Context, Effect, Layer } from "effect";
import { Files } from "@/files/service.ts";
import type { PersistenceError } from "@/persistence/mod.ts";
import {
  compilePattern,
  DEFAULT_CONTEXT_LINES,
  escapeRegex,
  matchLines,
} from "@/search/match.ts";
import type { GrepMatch, GrepOptions, GrepResult } from "@/search/types.ts";
import type { WorkspaceId } from "@/workspace/WorkspaceId.ts";

export interface Interface {
  /**
   * Search the workspace's files for a regex pattern, at most `maxResults`
   * matches overall. An invalid regex falls back to a literal match.
   */
  grep(
    pattern: string,
    options?: GrepOptions,
  ): Effect.Effect<GrepResult, PersistenceError, WorkspaceId>;
  /** Search for plain text, escaped as a literal regex. */
  search(
    text: string,
    options?: GrepOptions,
  ): Effect.Effect<GrepResult, PersistenceError, WorkspaceId>;
}

export class Search extends Context.Service<Search, Interface>()(
  "@essayist/core/search/Search",
) {
  /** Requires the {@linkcode Files} service; compose with Files.layerNoDeps
   * and Persistence.layerKv at the composition root. The workspace scope
   * comes from the WorkspaceId tag at call time. */
  static readonly layerNoDeps: Layer.Layer<Search, never, Files> = Layer.effect(
    Search,
    Effect.gen(function* () {
      const files = yield* Files;

      const grep = (
        pattern: string,
        options?: GrepOptions,
      ): Effect.Effect<GrepResult, PersistenceError, WorkspaceId> =>
        Effect.gen(function* () {
          const {
            path,
            caseSensitive = false,
            maxResults = 50,
          } = options ?? {};
          const regex = compilePattern(pattern, caseSensitive);
          const matches: GrepMatch[] = [];
          const fileList = yield* files.list(path);
          for (const file of fileList) {
            if (matches.length >= maxResults) break;

            const latest = yield* files.read(file.path);
            // Empty files and missing files share the "" sentinel.
            if (latest.content === "") continue;

            for (const match of matchLines(
              latest.content,
              regex,
              DEFAULT_CONTEXT_LINES,
            )) {
              if (matches.length >= maxResults) break;
              matches.push({ path: file.path, ...match });
            }
          }
          return { matches };
        });

      const search = (
        text: string,
        options?: GrepOptions,
      ): Effect.Effect<GrepResult, PersistenceError, WorkspaceId> =>
        grep(escapeRegex(text), options);

      return Search.of({ grep, search });
    }),
  );
}
