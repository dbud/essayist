/**
 * Mark placement as an Effect service: resolve a selected text span against
 * a version's content, capture context, and store the mark through the
 * Files service's mark list. Mark-list storage and migration live on Files;
 * the pure resolver lives in resolver.ts.
 */

import { Context, Effect, Layer } from "effect";
import { Files } from "@/files/service.ts";
import { Ids } from "@/ids.ts";
import { TokenizedText } from "@/marks/tokenized.ts";
import type { Mark, MarkOptions, MarkResult } from "@/marks/types.ts";
import type {
  ConcurrentModificationError,
  PersistenceError,
} from "@/persistence/mod.ts";
import type { WorkspaceId } from "@/workspace/WorkspaceId.ts";

/** Context span captured around a selection when none is given. */
const DEFAULT_CONTEXT_SPAN = 60;

/** Convert a 1-based line number to a character offset into the content. */
export function lineToOffset(content: string, line: number): number {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line && offset < content.length) {
    const nl = content.indexOf("\n", offset);
    if (nl === -1) break;
    offset = nl + 1;
    currentLine++;
  }
  return offset;
}

export interface Interface {
  /**
   * Place a mark on a text span of a file version. `marked: false` when the
   * file or version is missing or the span is not found on that version.
   */
  mark(
    path: string,
    selectedText: string,
    comment: string,
    options?: MarkOptions,
  ): Effect.Effect<
    MarkResult,
    PersistenceError | ConcurrentModificationError,
    WorkspaceId
  >;
}

export class Marks extends Context.Service<Marks, Interface>()(
  "@essayist/core/marks/Marks",
) {
  /** Requires the {@linkcode Files} service; compose with Files.layerNoDeps
   * and Persistence.layerKv at the composition root. The workspace scope
   * comes from the WorkspaceId tag at call time. */
  static readonly layerNoDeps: Layer.Layer<Marks, never, Files> = Layer.effect(
    Marks,
    Effect.gen(function* () {
      const files = yield* Files;

      const mark = (
        path: string,
        selectedText: string,
        comment: string,
        {
          label,
          lineHint,
          threadId,
          contextSpan = DEFAULT_CONTEXT_SPAN,
          versionId,
          provenance,
        }: MarkOptions = {},
      ): Effect.Effect<
        MarkResult,
        PersistenceError | ConcurrentModificationError,
        WorkspaceId
      > =>
        Effect.gen(function* () {
          const snapshot = yield* files.read(path, { versionId });
          // version_id "" marks a missing file or version: not markable.
          if (snapshot.version_id === "") {
            return { mark_id: "", thread_id: "", marked: false };
          }
          const { content, version_id } = snapshot;

          const offsetHint =
            lineHint !== undefined ? lineToOffset(content, lineHint) : 0;
          const tt = new TokenizedText(content);
          const offset = tt.findExactNear(selectedText, offsetHint);
          if (offset === null) {
            return { mark_id: "", thread_id: "", marked: false };
          }

          const beforeContext = tt.captureBeforeContext(offset, contextSpan);
          const afterContext = tt.captureAfterContext(
            offset + selectedText.length,
            contextSpan,
          );

          const ids = yield* Ids;
          const mark: Mark = {
            id: ids.next(),
            thread_id: threadId ?? ids.next(),
            path,
            version_id,
            selected_text: selectedText,
            before_context: beforeContext,
            after_context: afterContext,
            comment,
            label,
            created_at: Date.now(),
            offset,
            length: selectedText.length,
            status: "resolved",
            ...(provenance && { meta: provenance }),
          };
          yield* files.saveMark(mark);

          return {
            mark_id: mark.id,
            thread_id: mark.thread_id,
            marked: true,
          };
        });

      return Marks.of({ mark });
    }),
  );
}
