import type * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { PersistenceError } from "#/persistence/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { TraceEvents } from "./service.ts";
import { TraceEvent } from "./types.ts";

const backendFault = (cause: unknown) => new PersistenceError({ cause });

export function layerTraceEventsD1(
  client: D1Client.D1Client,
): Layer.Layer<TraceEvents, PersistenceError> {
  const ensureSchema = SqlSchema.void({
    Request: Schema.Void,
    execute: () =>
      client`CREATE TABLE IF NOT EXISTS review_trace_events (
        ws_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        event TEXT NOT NULL,
        PRIMARY KEY (ws_id, run_id, seq)
      ) WITHOUT ROWID`,
  });

  const insertEvent = SqlSchema.void({
    Request: Schema.Struct({
      wsId: Schema.String,
      runId: Schema.String,
      seq: Schema.Int,
      event: Schema.fromJsonString(TraceEvent),
    }),
    execute: ({ wsId, runId, seq, event }) =>
      client`INSERT INTO review_trace_events ${client.insert([
        { ws_id: wsId, run_id: runId, seq, event },
      ])}
        ON CONFLICT (ws_id, run_id, seq) DO UPDATE SET event = excluded.event`,
  });

  const findEventRows = SqlSchema.findAll({
    Request: Schema.Struct({ wsId: Schema.String, runId: Schema.String }),
    Result: Schema.Struct({ event: Schema.fromJsonString(TraceEvent) }),
    execute: ({ wsId, runId }) =>
      client`SELECT event FROM review_trace_events
        WHERE ws_id = ${wsId} AND run_id = ${runId} ORDER BY seq`,
  });

  const append = (
    runId: string,
    event: TraceEvent,
  ): Effect.Effect<void, PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      yield* Effect.mapError(insertEvent({ wsId, runId, seq: event.seq, event }), backendFault);
    });

  const get = (
    runId: string,
  ): Effect.Effect<TraceEvent[] | undefined, PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const rows = yield* Effect.mapError(
        findEventRows({ wsId: wsId, runId: runId }),
        backendFault,
      );
      if (rows.length === 0) return undefined;
      return rows.map((row) => row.event);
    });

  return Layer.unwrap(
    Effect.gen(function* () {
      yield* Effect.mapError(ensureSchema(), backendFault);
      return Layer.succeed(TraceEvents, TraceEvents.of({ append, get }));
    }),
  );
}
