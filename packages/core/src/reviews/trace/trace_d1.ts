import type * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { TraceEvents } from "./service.ts";
import { TraceEvent } from "./types.ts";

export function layerTraceEventsD1(client: D1Client.D1Client): Layer.Layer<TraceEvents> {
  const insertEvent = SqlSchema.void({
    Request: Schema.Struct({
      runId: Schema.String,
      seq: Schema.Int,
      event: Schema.fromJsonString(TraceEvent),
    }),
    execute: (request) =>
      client`INSERT INTO review_trace_events ${client.insert([request])}
        ON CONFLICT (runId, seq) DO UPDATE SET event = excluded.event`,
  });

  const findEvents = SqlSchema.findAll({
    Request: Schema.Struct({
      wsId: Schema.String,
      runId: Schema.String,
      afterSeq: Schema.optional(Schema.Int),
    }),
    Result: Schema.Struct({ event: Schema.fromJsonString(TraceEvent) }),
    execute: ({ wsId, runId, afterSeq }) =>
      client`SELECT e.event FROM review_trace_events e
        JOIN review_runs r ON r.id = e.runId
        JOIN files f ON f.id = r.fileId
        WHERE e.runId = ${runId} AND f.wsId = ${wsId}
        ${afterSeq === undefined ? client`` : client` AND e.seq > ${afterSeq}`}
        ORDER BY e.seq`,
  });

  const append = (runId: string, event: TraceEvent) =>
    Effect.orDie(insertEvent({ runId, seq: event.seq, event }));

  const get = (runId: string, afterSeq?: number) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const rows = yield* Effect.orDie(findEvents({ wsId, runId, afterSeq }));
      return rows.map((row) => row.event);
    });

  return Layer.succeed(TraceEvents, TraceEvents.of({ append, get }));
}
