import { jsonLogLayer } from "@essayist/core";
import { Cache, Cause, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import { layerApi } from "#/api/index.ts";
import type { WorkerEnv } from "#/env.ts";
import { runtime, runtimeLayer } from "#/runtime.ts";
import { captureError } from "#/telemetry/sentry.ts";

type RequestHandler = (request: Request) => Promise<Response>;

const handlers = Effect.runSync(
  Cache.make<WorkerEnv, RequestHandler>({
    capacity: Number.MAX_SAFE_INTEGER,
    lookup: (e: WorkerEnv) =>
      Effect.sync(
        () =>
          HttpRouter.toWebHandler(
            layerApi.pipe(Layer.provide(runtimeLayer(e)), Layer.provide(HttpServer.layerServices)),
            { memoMap: runtime(e).memoMap },
          ).handler,
      ),
  }),
);

export function apiHandler(request: Request, e: WorkerEnv): Promise<Response> {
  const program = Effect.gen(function* () {
    const handler = yield* Cache.get(handlers, e);
    return yield* Effect.tryPromise({
      try: () => handler(request),
      catch: (cause) => cause,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        const pretty = Cause.pretty(cause);
        yield* Effect.logError("api handler failed", { cause: pretty });
        captureError(pretty);
        return new Response("internal error", { status: 500 });
      }),
    ),
    Effect.provide(jsonLogLayer),
  );
  return Effect.runPromise(program);
}
