// API tier prototype. Endpoint paths carry the /api prefix: hono forwards
// matching requests untouched, so the paths must be absolute from the root.
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/http-api";
import { VotesDataSchema } from "@/models/votes.data";
import { Votes } from "@/votes/service";

const getVotes = HttpApiEndpoint.get("getVotes", "/api/votes", {
  success: VotesDataSchema,
});

const incrementVotes = HttpApiEndpoint.post(
  "incrementVotes",
  "/api/votes/increment",
  { success: VotesDataSchema },
);

const decrementVotes = HttpApiEndpoint.post(
  "decrementVotes",
  "/api/votes/decrement",
  { success: VotesDataSchema },
);

const VotesGroup = HttpApiGroup.make("votes")
  .add(getVotes)
  .add(incrementVotes)
  .add(decrementVotes);

export const VotesApi = HttpApi.make("votes").add(VotesGroup);

const VotesHandlers = HttpApiBuilder.group(
  VotesApi,
  "votes",
  Effect.fn(function* (handlers) {
    const withCount = (count: number) => ({ count });

    const store = yield* Votes;

    return handlers.handleAll({
      getVotes: () => store.get().pipe(Effect.map(withCount)),
      incrementVotes: () => store.increment().pipe(Effect.map(withCount)),
      decrementVotes: () => store.decrement().pipe(Effect.map(withCount)),
    });
  }),
).pipe(Layer.provide(Votes.layerMemory));

const apiRoutes = HttpApiBuilder.layer(VotesApi).pipe(
  Layer.provide([VotesHandlers]),
);

// Built eagerly at module scope: fibers started inside fetch capture the
// request async context on Workers (HttpRouter.toWebHandler guidance).
const apiHandler = HttpRouter.toWebHandler(
  apiRoutes.pipe(Layer.provide(HttpServer.layerServices)),
  { disableLogger: true },
).handler;

export { apiHandler };
