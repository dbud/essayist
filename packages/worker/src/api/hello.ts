// API tier prototype (ESS-79): one schema-first endpoint, mounted into hono
// at /api/* by main.ts. Endpoint paths carry the /api prefix because hono
// forwards matching requests untouched. Group middleware and typed errors
// arrive with the first real feature port.
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/http-api";

const HelloMessage = Schema.Struct({
  message: Schema.String,
});

const helloEndpoint = HttpApiEndpoint.get("hello", "/api/hello", {
  success: HelloMessage,
});

const HelloGroup = HttpApiGroup.make("hello").add(helloEndpoint);

export const HelloApi = HttpApi.make("hello").add(HelloGroup);

const HelloHandlers = HttpApiBuilder.group(
  HelloApi,
  "hello",
  Effect.fn(function* (handlers) {
    return handlers.handleAll({
      hello: () =>
        Effect.succeed({ message: "Hello from the http-api prototype" }),
    });
  }),
);

const apiRoutes = HttpApiBuilder.layer(HelloApi).pipe(
  Layer.provide([HelloHandlers]),
);

// Built eagerly at module scope: fibers started inside fetch capture the
// request async context on Workers (HttpRouter.toWebHandler guidance).
const apiHandler = HttpRouter.toWebHandler(
  apiRoutes.pipe(Layer.provide(HttpServer.layerServices)),
  { disableLogger: true },
).handler;

export { apiHandler };
