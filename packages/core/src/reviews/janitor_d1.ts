import type * as D1Client from "@effect/sql-d1/D1Client";
import { DateTime, Effect, Layer, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { ReviewJanitor } from "./janitor.ts";

export function layerReviewJanitorD1(client: D1Client.D1Client): Layer.Layer<ReviewJanitor> {
  const findStaleRuns = SqlSchema.findAll({
    Request: Schema.Struct({ staleBefore: Schema.DateTimeUtcFromString }),
    Result: Schema.Struct({ runId: Schema.String, wsId: Schema.String }),
    execute: ({ staleBefore }) =>
      client`SELECT r.id AS runId, f.wsId FROM review_runs r JOIN files f ON f.id = r.fileId
        WHERE r.status = 'running'
          AND (r.heartbeatAt IS NULL OR r.heartbeatAt < ${staleBefore})
        ORDER BY r.startedAt
        LIMIT 100`,
  });

  const staleRuns = (staleMs: number) =>
    Effect.gen(function* () {
      const staleBefore = DateTime.subtract(yield* DateTime.now, { milliseconds: staleMs });
      return yield* Effect.orDie(findStaleRuns({ staleBefore }));
    });

  return Layer.succeed(ReviewJanitor, ReviewJanitor.of({ staleRuns }));
}
