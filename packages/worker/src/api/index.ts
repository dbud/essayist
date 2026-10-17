// The api tier; endpoint paths are root-relative and the /api prefix is
// applied once at assembly.
import { Effect, Layer } from "effect";
import { HttpApi, HttpApiBuilder } from "effect/http-api";
import { sessionMiddleware, UserSession } from "#/api/sessionMiddleware.ts";
import { Votes } from "#/votes/service.ts";
import { userGroup } from "./user";
import { votesGroup } from "./votes";

const api = HttpApi.make("api").add(votesGroup).add(userGroup).prefix("/api");

const votesHandlers = HttpApiBuilder.group(
  api,
  "votes",
  Effect.fn(function* (handlers) {
    const store = yield* Votes;
    const withCount = (count: number) => ({ count });

    return handlers.handleAll({
      getVotes: () => store.get().pipe(Effect.map(withCount)),
      incrementVotes: () => store.increment().pipe(Effect.map(withCount)),
      decrementVotes: () => store.decrement().pipe(Effect.map(withCount)),
      chaosVotes: () => store.chaos().pipe(Effect.map((armed) => ({ armed }))),
    });
  }),
);

const userHandlers = HttpApiBuilder.group(
  api,
  "user",
  Effect.fn(function* (handlers) {
    return handlers.handleAll({
      getUser: () => Effect.map(UserSession, ({ user }) => user),
    });
  }),
);

export const layerApi = HttpApiBuilder.layer(api).pipe(
  Layer.provide(votesHandlers),
  Layer.provide(userHandlers),
  Layer.provide(sessionMiddleware),
);
