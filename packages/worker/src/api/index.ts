// The api tier; endpoint paths are root-relative and the /api prefix is
// applied once at assembly.
import { type Files, UserState, Workspaces } from "@essayist/core";
import { Effect, Layer } from "effect";
import { HttpApi, HttpApiBuilder, HttpApiError } from "effect/http-api";
import { sessionMiddleware, UserSession } from "#/api/sessionMiddleware.ts";
import { fileTreeLoader } from "#/models/fileTree.loader.ts";
import { workspacesLoader } from "#/models/workspaces.loader.ts";
import { Votes } from "#/votes/service.ts";
import { userGroup } from "./user";
import { votesGroup } from "./votes";
import { workspaceGroup } from "./workspaces";

const api = HttpApi.make("api")
  .add(votesGroup)
  .add(userGroup)
  .add(workspaceGroup)
  .prefix("/api");

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

const workspaceHandlers = HttpApiBuilder.group(
  api,
  "workspaces",
  Effect.fn(function* (handlers) {
    const stores = yield* Effect.context<Workspaces | UserState | Files>();
    const workspacesStore = yield* Workspaces;
    const userState = yield* UserState;

    const requireAccess = (wsId: string, userId: string) =>
      Effect.gen(function* () {
        const allowed = yield* Effect.orDie(
          workspacesStore.hasAccess(wsId, userId),
        );
        if (!allowed) {
          return yield* Effect.fail(new HttpApiError.Forbidden());
        }
      });

    return handlers.handleAll({
      getWorkspaces: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          return yield* Effect.orDie(
            workspacesLoader(user.id, req.query.wsId).pipe(
              Effect.provide(stores),
            ),
          );
        }),
      selectWorkspace: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId } = req.payload;
          yield* requireAccess(wsId, user.id);
          yield* Effect.orDie(userState.setSelectedWorkspace(user.id, wsId));
        }),
      getFiles: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          yield* requireAccess(req.query.wsId, user.id);
          return yield* Effect.orDie(
            fileTreeLoader(user.id, req.query.wsId, req.query.path).pipe(
              Effect.provide(stores),
            ),
          );
        }),
      selectFile: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path } = req.payload;
          yield* requireAccess(wsId, user.id);
          yield* Effect.orDie(userState.setSelectedFile(user.id, wsId, path));
        }),
    });
  }),
);

export const layerApi = HttpApiBuilder.layer(api).pipe(
  Layer.provide(votesHandlers),
  Layer.provide(userHandlers),
  Layer.provide(workspaceHandlers),
  Layer.provide(sessionMiddleware),
);
