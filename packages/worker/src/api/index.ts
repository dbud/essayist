// The api tier; endpoint paths are root-relative and the /api prefix is applied once at assembly.
import {
  type AuthStore,
  agentflowDefinition,
  buildReviewGraph,
  ConcurrentModificationError,
  Files,
  FileMissingError,
  Marks,
  ModelClient,
  nextId,
  type PersistenceError,
  resolveActiveReviewPass,
  resolveReviewPass,
  ReviewConfig,
  ReviewRuns,
  runReviewPass,
  TraceEvents,
  UserState,
  WorkspaceId,
  Workspaces,
} from "@essayist/core";
import { Effect, Layer } from "effect";
import { HttpApi, HttpApiBuilder, HttpApiError } from "effect/http-api";

import { importGoogleDocFile } from "#/api/googleDocs.ts";
import { sessionMiddleware, UserSession, adminMiddleware } from "#/api/sessionMiddleware.ts";
import { stubModelClient } from "#/api/stubModel.ts";
import type { GoogleConfig } from "#/env.ts";
import { fileContentLoader } from "#/models/fileContent.loader.ts";
import { fileTreeLoader } from "#/models/fileTree.loader.ts";
import { fileVersionsLoader } from "#/models/fileVersions.loader.ts";
import { workspacesLoader } from "#/models/workspaces.loader.ts";

import { adminGroup } from "./admin";
import { ApiBadRequest, ApiFailure } from "./errors";
import { userGroup } from "./user";
import { workspaceGroup } from "./workspaces";

const api = HttpApi.make("api").add(userGroup).add(workspaceGroup).add(adminGroup).prefix("/api");

const userHandlers = HttpApiBuilder.group(
  api,
  "user",
  // oxlint-disable-next-line eslint/require-yield -- only registers handlers, nothing to yield
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
      | Workspaces
      | UserState
      | Files
      | AuthStore
      | GoogleConfig
      | ReviewConfig
      | ReviewRuns
      | TraceEvents
      | Marks
    >();
    const workspacesStore = yield* Workspaces;
    const userState = yield* UserState;
    const files = yield* Files;

    const requireAccess = (wsId: string, userId: string) =>
      Effect.gen(function* () {
        const allowed = yield* Effect.orDie(workspacesStore.hasAccess(wsId, userId));
        if (!allowed) {
          return yield* Effect.fail(new HttpApiError.Forbidden());
        }
      });

    // The file write verbs fail with this triple: persistence and concurrent-write faults are
    // defects per the worker convention, a missing file maps to 404.
    const dieWriteErrors = <A, R>(
      self: Effect.Effect<A, PersistenceError | ConcurrentModificationError | FileMissingError, R>,
    ): Effect.Effect<A, HttpApiError.NotFound, R> =>
      Effect.catchTags(self, {
        PersistenceError: Effect.die,
        ConcurrentModificationError: Effect.die,
        FileMissingError: () => Effect.fail(new HttpApiError.NotFound()),
      });

    return handlers.handleAll({
      getWorkspaces: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          return yield* Effect.orDie(
            workspacesLoader(user.id, req.query.wsId).pipe(Effect.provide(stores)),
          );
        }),
      selectWorkspace: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId } = req.payload;
          yield* requireAccess(wsId, user.id);
          yield* Effect.orDie(userState.setSelectedWorkspace(user.id, wsId));
        }),
      createWorkspace: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          return yield* Effect.orDie(
            workspacesStore.createWorkspace(req.payload.name, user.id).pipe(Effect.provide(stores)),
          );
        }),
      getFiles: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          yield* requireAccess(req.query.wsId, user.id);
          return yield* Effect.orDie(
            fileTreeLoader(user.id, req.query.wsId, req.query.path).pipe(Effect.provide(stores)),
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
          const { wsId, path, versionId } = req.query;
          yield* requireAccess(wsId, user.id);
          return yield* fileContentLoader(wsId, path, versionId).pipe(
            Effect.provide(stores),
            Effect.catchTag("PersistenceError", Effect.die),
            Effect.catchTag("FileMissingError", () => Effect.fail(new HttpApiError.NotFound())),
          );
        }),
      getFileVersions: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path } = req.query;
          yield* requireAccess(wsId, user.id);
          return yield* fileVersionsLoader(wsId, path).pipe(
            Effect.provide(stores),
            Effect.catchTag("PersistenceError", Effect.die),
            Effect.catchTag("FileMissingError", () => Effect.fail(new HttpApiError.NotFound())),
          );
        }),
      getMarks: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path, versionId } = req.query;
          yield* requireAccess(wsId, user.id);
          return yield* files
            .getMarks(path, versionId)
            .pipe(
              Effect.provideService(WorkspaceId, { wsId }),
              Effect.catchTag("PersistenceError", Effect.die),
            );
        }),
      saveFileDraft: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path, content } = req.payload;
          yield* requireAccess(wsId, user.id);
          return yield* files
            .writeDraft(path, content)
            .pipe(Effect.provideService(WorkspaceId, { wsId }), dieWriteErrors);
        }),
      promoteFileDraft: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path } = req.payload;
          yield* requireAccess(wsId, user.id);
          const result = yield* files
            .promoteDraft(path)
            .pipe(Effect.provideService(WorkspaceId, { wsId }), dieWriteErrors);
          if (result === null) {
            return yield* Effect.fail(new HttpApiError.NotFound());
          }
          return result;
        }),
      createFile: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path, content } = req.payload;
          yield* requireAccess(wsId, user.id);
          const entries = yield* files
            .list(path)
            .pipe(
              Effect.provideService(WorkspaceId, { wsId }),
              Effect.catchTag("PersistenceError", Effect.die),
            );
          if (entries.some((entry) => entry.path === path)) {
            return yield* Effect.fail(new HttpApiError.Conflict());
          }
          return yield* files.write(path, content).pipe(
            Effect.provideService(WorkspaceId, { wsId }),
            Effect.catchTags({
              PersistenceError: Effect.die,
              ConcurrentModificationError: Effect.die,
              // create-only: by the time write runs the path exists, so a missing file is a defect
              FileMissingError: Effect.die,
            }),
          );
        }),
      upsertFile: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path, content } = req.payload;
          yield* requireAccess(wsId, user.id);
          return yield* files
            .write(path, content)
            .pipe(Effect.provideService(WorkspaceId, { wsId }), dieWriteErrors);
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
      getReviewRuns: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path } = req.query;
          yield* requireAccess(wsId, user.id);
          return yield* Effect.orDie(
            ReviewRuns.use((store) => store.listRuns(path)).pipe(
              Effect.provideService(WorkspaceId, { wsId }),
              Effect.provide(stores),
            ),
          );
        }),
      startReview: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path } = req.payload;
          yield* requireAccess(wsId, user.id);
          // Promote the pending draft first: the review reads the latest checkpoint.
          yield* files
            .promoteDraft(path)
            .pipe(Effect.provideService(WorkspaceId, { wsId }), dieWriteErrors);
          const pass = yield* Effect.orDie(resolveActiveReviewPass.pipe(Effect.provide(stores)));
          if (pass === undefined) {
            return yield* Effect.fail(
              new ApiFailure({ message: "No active review pass configured." }),
            );
          }
          return yield* runReviewPass({ pass, path }).pipe(
            Effect.provideService(WorkspaceId, { wsId }),
            Effect.provide(stores),
            Effect.provideService(ModelClient, stubModelClient),
            Effect.catchTag("ReviewFileMissingError", () =>
              Effect.fail(new HttpApiError.NotFound()),
            ),
            Effect.catchTag("ReviewLeaseTakenError", (err) =>
              Effect.fail(new ApiFailure({ message: err.message })),
            ),
            Effect.catchTags({
              ReviewRunMissingError: Effect.die,
              PersistenceError: Effect.die,
              ConcurrentModificationError: Effect.die,
              MissingChunksError: Effect.die,
            }),
          );
        }),
    });
  }),
);

const adminHandlers = HttpApiBuilder.group(
  api,
  "admin",
  Effect.fn(function* (handlers) {
    const config = yield* ReviewConfig;
    const OK = { ok: true as const };
    // Persistence and concurrent-write faults are defects per the worker convention; every config
    // store call fails with exactly this pair (or the Persistence-only reads, caught pointwise).
    const diePersist = <A, R>(
      self: Effect.Effect<A, PersistenceError | ConcurrentModificationError, R>,
    ): Effect.Effect<A, never, R> =>
      Effect.catchTags(self, {
        PersistenceError: Effect.die,
        ConcurrentModificationError: Effect.die,
      });

    return handlers.handleAll({
      getAdminConfig: () =>
        Effect.gen(function* () {
          const modelPools = yield* config.listModelPools();
          const prompts = yield* config.listPrompts();
          const categories = yield* config.listCategories();
          const reviewPasses = yield* config.listReviewPasses();
          const activeReviewPassId = yield* config.getActiveReviewPassId();
          return { modelPools, prompts, categories, reviewPasses, activeReviewPassId };
        }).pipe(Effect.catchTag("PersistenceError", Effect.die)),
      createCategory: (req) => {
        const category = { ...req.payload, id: nextId() };
        return config.saveCategory(category).pipe(diePersist, Effect.as(category));
      },
      updateCategory: (req) => {
        const category = { ...req.payload, id: req.params.id };
        return config.saveCategory(category).pipe(diePersist, Effect.as(category));
      },
      deleteCategory: (req) => config.deleteCategory(req.params.id).pipe(diePersist, Effect.as(OK)),
      createModelPool: (req) => {
        const pool = { ...req.payload, id: nextId() };
        return config.saveModelPool(pool).pipe(diePersist, Effect.as(pool));
      },
      updateModelPool: (req) => {
        const pool = { ...req.payload, id: req.params.id };
        return config.saveModelPool(pool).pipe(diePersist, Effect.as(pool));
      },
      deleteModelPool: (req) =>
        config.deleteModelPool(req.params.id).pipe(diePersist, Effect.as(OK)),
      createPrompt: (req) =>
        config.savePrompt(req.payload).pipe(diePersist, Effect.as(req.payload)),
      updatePrompt: (req) => {
        const prompt = { ...req.payload, key: req.params.key };
        return config.savePrompt(prompt).pipe(diePersist, Effect.as(prompt));
      },
      deletePrompt: (req) => config.deletePrompt(req.params.key).pipe(diePersist, Effect.as(OK)),
      createReviewPass: (req) => {
        const pass = { ...req.payload, id: nextId() };
        return config.saveReviewPass(pass).pipe(diePersist, Effect.as(pass));
      },
      updateReviewPass: (req) => {
        const pass = { ...req.payload, id: req.params.id };
        return config.saveReviewPass(pass).pipe(diePersist, Effect.as(pass));
      },
      deleteReviewPass: (req) =>
        config.deleteReviewPass(req.params.id).pipe(diePersist, Effect.as(OK)),
      setActiveReviewPass: (req) =>
        Effect.gen(function* () {
          const reviewPassId = req.payload.reviewPassId;
          const pass = yield* config
            .getReviewPass(reviewPassId)
            .pipe(Effect.catchTag("PersistenceError", Effect.die));
          if (pass === undefined) {
            return yield* Effect.fail(new HttpApiError.NotFound());
          }
          yield* config.setActiveReviewPass(reviewPassId).pipe(diePersist);
          return { activeReviewPassId: reviewPassId };
        }),
      getPassGraph: (req) =>
        Effect.gen(function* () {
          const pass = yield* config
            .getReviewPass(req.params.id)
            .pipe(Effect.catchTag("PersistenceError", Effect.die));
          if (pass === undefined) {
            return yield* Effect.fail(new HttpApiError.NotFound());
          }
          const resolved = yield* resolveReviewPass(pass).pipe(
            Effect.provideService(ReviewConfig, config),
            Effect.catchTag("ConfigMissingError", (err) =>
              Effect.fail(new ApiBadRequest({ message: err.message })),
            ),
            Effect.catchTag("ConfigInvalidError", (err) =>
              Effect.fail(new ApiBadRequest({ message: err.message })),
            ),
            Effect.catchTag("PersistenceError", Effect.die),
          );
          const graph = buildReviewGraph(resolved, "preview");
          return {
            name: pass.name,
            nodes: graph.nodes.map((node) => ({ id: node.id, kind: node.kind })),
            edges: graph.nodes.flatMap((node) =>
              node.dependsOn.map((dep) => ({ from: dep, to: node.id })),
            ),
            definition: agentflowDefinition(graph),
          };
        }),
    });
  }),
);

export const layerApi = HttpApiBuilder.layer(api).pipe(
  Layer.provide(userHandlers),
  Layer.provide(workspaceHandlers),
  Layer.provide(adminHandlers),
  Layer.provide(sessionMiddleware),
  Layer.provide(adminMiddleware),
);
