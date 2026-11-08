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
        wsId TEXT NOT NULL,
        runId TEXT NOT NULL,
        seq INTEGER NOT NULL,
        event TEXT NOT NULL,
        PRIMARY KEY (wsId, runId, seq)
      ) WITHOUT ROWID`,
  });

  const insertEvent = SqlSchema.void({
    Request: Schema.Struct({
      wsId: Schema.String,
      runId: Schema.String,
      seq: Schema.Int,
      event: Schema.fromJsonString(TraceEvent),
    }),
    execute: (request) =>
      client`INSERT INTO review_trace_events ${client.insert([request])}
        ON CONFLICT (wsId, runId, seq) DO UPDATE SET event = excluded.event`,
  });

  const findEventRows = SqlSchema.findAll({
    Request: Schema.Struct({
      wsId: Schema.String,
      runId: Schema.String,
      afterSeq: Schema.optional(Schema.Int),
    }),
    Result: Schema.Struct({ event: Schema.fromJsonString(TraceEvent) }),
    execute: ({ wsId, runId, afterSeq }) =>
      client`SELECT event FROM review_trace_events
        WHERE wsId = ${wsId} AND runId = ${runId}
        ${afterSeq === undefined ? client`` : client` AND seq > ${afterSeq}`}
        ORDER BY seq`,
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
    afterSeq?: number,
  ): Effect.Effect<TraceEvent[], PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const rows = yield* Effect.mapError(findEventRows({ wsId, runId, afterSeq }), backendFault);
      return rows.map((row) => row.event);
    });

  return Layer.unwrap(
    Effect.gen(function* () {
      yield* Effect.mapError(ensureSchema(), backendFault);
      return Layer.succeed(TraceEvents, TraceEvents.of({ append, get }));
    }),
  );
}
