import type * as D1Client from "@effect/sql-d1/D1Client";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { Files } from "#/files/service.ts";
import { Ids } from "#/idsRef.ts";
import { TokenizedText } from "#/marks/tokenized.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { type MarkInput, Marks } from "./service.ts";
import { Mark, MarkTextNotFoundError } from "./types.ts";

/** Context span captured around a selection when none is given. */
const DEFAULT_CONTEXT_SPAN = 60;

/** Convert a 1-based line number to a character offset into the content. */
function lineToOffset(content: string, line: number): number {
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

export function layerMarksD1(client: D1Client.D1Client): Layer.Layer<Marks, never, Files> {
  const insertMark = SqlSchema.void({
    Request: Mark,
    execute: (row) => client`INSERT INTO marks ${client.insert([row])}`,
  });

  const findRunMarks = SqlSchema.findAll({
    Request: Schema.Struct({ wsId: Schema.String, runId: Schema.String }),
    Result: Mark,
    execute: ({ wsId, runId }) =>
      client`SELECT m.* FROM marks m
        JOIN review_runs r ON r.id = m.runId
        JOIN files f ON f.id = r.fileId
        WHERE m.runId = ${runId} AND f.wsId = ${wsId}
        ORDER BY m.createdAt, m.rowid`,
  });

  return Layer.effect(
    Marks,
    Effect.gen(function* () {
      const files = yield* Files;

      const mark = ({
        fileId,
        versionId,
        runId,
        selectedText,
        comment,
        categoryId,
        lineHint,
        contextSpan = DEFAULT_CONTEXT_SPAN,
      }: MarkInput) =>
        Effect.gen(function* () {
          const { content } = yield* files.read(fileId, versionId);
          const tt = new TokenizedText(content);
          const offsetHint = lineHint === undefined ? 0 : lineToOffset(content, lineHint);
          const offset = tt.findExactNear(selectedText, offsetHint);
          if (offset === null)
            return yield* Effect.fail(new MarkTextNotFoundError({ selectedText }));

          const ids = yield* Ids;
          const created = new Mark({
            id: ids.next(),
            runId,
            categoryId: Option.fromUndefinedOr(categoryId),
            selectedText,
            beforeContext: tt.captureBeforeContext(offset, contextSpan),
            afterContext: tt.captureAfterContext(offset + selectedText.length, contextSpan),
            comment,
            createdAt: yield* DateTime.now,
            offset,
            length: selectedText.length,
          });
          yield* Effect.orDie(insertMark(created));
          return created;
        });

      const ofRun = (runId: string) =>
        Effect.gen(function* () {
          const { wsId } = yield* WorkspaceId;
          return yield* Effect.orDie(findRunMarks({ wsId, runId }));
        });

      return Marks.of({ mark, ofRun });
    }),
  );
}
