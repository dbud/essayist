import type * as D1Client from "@effect/sql-d1/D1Client";
import { Clock, Effect, Layer, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { PersistenceError } from "#/persistence/service.ts";

import type { RunRef } from "./drive.ts";
import { ReviewJanitor } from "./janitor.ts";

const backendFault = (cause: unknown) => new PersistenceError({ cause });

export function layerReviewJanitorD1(
  client: D1Client.D1Client,
): Layer.Layer<ReviewJanitor, PersistenceError> {
  const findStaleRows = SqlSchema.findAll({
    Request: Schema.Struct({ cutoff: Schema.Number }),
    Result: Schema.Struct({ wsId: Schema.String, id: Schema.String }),
    execute: ({ cutoff }) =>
      client`SELECT wsId, id FROM review_runs
        WHERE status = 'running'
          AND (heartbeatAt IS NULL OR heartbeatAt < ${cutoff})
        ORDER BY startedAt
        LIMIT 100`,
  });

  const staleRuns = (staleMs: number): Effect.Effect<RunRef[], PersistenceError> =>
    Effect.gen(function* () {
      const cutoff = (yield* Clock.currentTimeMillis) - staleMs;
      const rows = yield* Effect.mapError(findStaleRows({ cutoff }), backendFault);
      return rows.map(({ wsId, id }) => ({ runId: id, wsId }));
    });

  return Layer.succeed(ReviewJanitor, ReviewJanitor.of({ staleRuns }));
}
