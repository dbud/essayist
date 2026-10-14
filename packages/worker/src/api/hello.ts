// API tier prototype. Endpoint paths carry the /api prefix: hono forwards
// matching requests untouched, so the paths must be absolute from the root.
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
