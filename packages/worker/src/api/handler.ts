// One handler per env snapshot, built on first use like the runtime; the layer shares the runtime's
// memo map, so both tiers run the same service instances.
import { Cache, Cause, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import { layerApi } from "#/api/index.ts";
import type { WorkerEnv } from "#/env.ts";
import { runtime, runtimeLayer } from "#/runtime.ts";

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
      Effect.sync(() => {
        console.error(Cause.pretty(cause));
        return new Response("internal error", { status: 500 });
      }),
    ),
  );
  return Effect.runPromise(program);
}
