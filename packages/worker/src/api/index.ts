// The api tier; endpoint paths are root-relative and the /api prefix is
// applied once at assembly.
import {
  type AuthStore,
  Files,
  UserState,
  WorkspaceId,
  Workspaces,
} from "@essayist/core";
import { Effect, Layer } from "effect";
import { HttpApi, HttpApiBuilder, HttpApiError } from "effect/http-api";
import { importGoogleDocFile } from "#/api/googleDocs.ts";
import { sessionMiddleware, UserSession } from "#/api/sessionMiddleware.ts";
import type { GoogleConfig } from "#/env.ts";
import { fileContentLoader } from "#/models/fileContent.loader.ts";
import { fileTreeLoader } from "#/models/fileTree.loader.ts";
import { fileVersionsLoader } from "#/models/fileVersions.loader.ts";
import { workspacesLoader } from "#/models/workspaces.loader.ts";
import { userGroup } from "./user";
import { workspaceGroup } from "./workspaces";

const api = HttpApi.make("api")
  .add(userGroup)
  .add(workspaceGroup)
  .prefix("/api");

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
    const stores = yield* Effect.context<
      Workspaces | UserState | Files | AuthStore | GoogleConfig
    >();
    const workspacesStore = yield* Workspaces;
    const userState = yield* UserState;
    const files = yield* Files;

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
      getFileContent: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path } = req.query;
          yield* requireAccess(wsId, user.id);
          return yield* fileContentLoader(wsId, path).pipe(
            Effect.provide(stores),
            Effect.catchTag("PersistenceError", (err) => Effect.die(err)),
            Effect.catchTag("FileMissingError", () =>
              Effect.fail(new HttpApiError.NotFound()),
            ),
          );
        }),
      getFileVersions: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path } = req.query;
          yield* requireAccess(wsId, user.id);
          return yield* fileVersionsLoader(wsId, path).pipe(
            Effect.provide(stores),
            Effect.catchTag("PersistenceError", (err) => Effect.die(err)),
            Effect.catchTag("FileMissingError", () =>
              Effect.fail(new HttpApiError.NotFound()),
            ),
          );
        }),
      saveFileDraft: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path, content } = req.payload;
          yield* requireAccess(wsId, user.id);
          return yield* files.writeDraft(path, content).pipe(
            Effect.provideService(WorkspaceId, { wsId }),
            Effect.catchTag("PersistenceError", (err) => Effect.die(err)),
            Effect.catchTag("ConcurrentModificationError", (err) =>
              Effect.die(err),
            ),
            Effect.catchTag("FileMissingError", () =>
              Effect.fail(new HttpApiError.NotFound()),
            ),
          );
        }),
      importGoogleDoc: (req) =>
        Effect.gen(function* () {
          const { user, sessionId } = yield* UserSession;
          const { wsId, docId, name } = req.payload;
          yield* requireAccess(wsId, user.id);
          return yield* importGoogleDocFile({
            sessionId,
            wsId,
            docId,
            name,
          }).pipe(Effect.provide(stores));
        }),
    });
  }),
);

export const layerApi = HttpApiBuilder.layer(api).pipe(
  Layer.provide(userHandlers),
  Layer.provide(workspaceHandlers),
  Layer.provide(sessionMiddleware),
);
