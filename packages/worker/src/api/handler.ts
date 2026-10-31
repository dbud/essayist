import { jsonLogLayer } from "@essayist/core";
import { captureException } from "@sentry/cloudflare";
import { Cache, Cause, Effect, ErrorReporter, Layer, Result } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import { layerApi } from "#/api/index.ts";
import type { WorkerEnv } from "#/env.ts";
import { runtime, runtimeLayer } from "#/runtime.ts";

type RequestHandler = (request: Request) => Promise<Response>;

const sentryReporter: ErrorReporter.ErrorReporter = {
  [ErrorReporter.TypeId]: ErrorReporter.TypeId,
  report: ({ cause }) => {
    const defect = Cause.findDefect(cause);
    if (Result.isSuccess(defect)) captureException(defect.success);
  },
};

const handlers = Effect.runSync(
  Cache.make<WorkerEnv, RequestHandler>({
    capacity: Number.MAX_SAFE_INTEGER,
    lookup: (e: WorkerEnv) =>
      Effect.sync(
        () =>
          HttpRouter.toWebHandler(
            layerApi.pipe(
              Layer.provide(runtimeLayer(e)),
              Layer.provide(HttpServer.layerServices),
              Layer.provide(ErrorReporter.layer([sentryReporter])),
            ),
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
        yield* Effect.logError("api handler failed", { cause: Cause.pretty(cause) });
        const defect = Cause.findDefect(cause);
        if (Result.isSuccess(defect)) captureException(defect.success);
        else captureException(Cause.pretty(cause));
        return new Response("internal error", { status: 500 });
      }),
    ),
    Effect.provide(jsonLogLayer),
  );
  return Effect.runPromise(program);
}
