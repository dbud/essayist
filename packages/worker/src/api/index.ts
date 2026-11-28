// The api tier; endpoint paths are root-relative and the /api prefix is applied once at assembly.
import {
  type AuthStore,
  agentflowDefinition,
  type ConfigInvalidError,
  type ConfigMissingError,
  buildReviewGraph,
  Category,
  type DraftStaleError,
  type FileExistsError,
  Files,
  type FileTooLargeError,
  Marks,
  type ModelClient,
  ModelPool,
  Prompt,
  randomId,
  resolveActiveReviewPass,
  type Role,
  resolveReviewPass,
  ReviewConfig,
  ReviewPacing,
  ReviewPass,
  ReviewRuns,
  TraceEvents,
  UserState,
  WorkspaceId,
  Workspaces,
} from "@essayist/core";
import { Effect, Layer, Option } from "effect";
import { HttpApi, HttpApiBuilder, HttpApiError } from "effect/http-api";

import { importGoogleDocFile } from "#/api/googleDocs.ts";
import { sessionMiddleware, UserSession, adminMiddleware } from "#/api/sessionMiddleware.ts";
import type { GoogleConfig } from "#/env.ts";
import { adminConfigLoader } from "#/models/admin.loader.ts";
import { fileContentLoader } from "#/models/fileContent.loader.ts";
import { fileTreeLoader } from "#/models/fileTree.loader.ts";
import { fileVersionsLoader } from "#/models/fileVersions.loader.ts";
import { latestReviewLoader } from "#/models/latestReview.loader.ts";
import { reviewRunsLoader } from "#/models/reviewRuns.loader.ts";
import { workspacesLoader } from "#/models/workspaces.loader.ts";
import { RunDrivers } from "#/reviews/runDrivers.ts";

import { adminGroup } from "./admin";
import { ApiBadRequest, ApiConflict, ApiFailure, ApiTooLarge } from "./errors";
import { userGroup } from "./user";
import { workspaceGroup } from "./workspaces";

const ALREADY_REVIEWING = "A review is already running on this file.";

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
      | ReviewPacing
      | TraceEvents
      | Marks
      | ModelClient
      | RunDrivers
    >();
    const workspacesStore = yield* Workspaces;
    const userState = yield* UserState;
    const files = yield* Files;

    const requireAccess = (wsId: string, userId: string, role?: Role) =>
      Effect.gen(function* () {
        const allowed = yield* Effect.orDie(workspacesStore.hasAccess(wsId, userId, role));
        if (!allowed) {
          return yield* Effect.fail(new HttpApiError.Forbidden());
        }
      });

    const notFound = () => Effect.fail(new HttpApiError.NotFound());
    const tooLarge = (error: FileTooLargeError) =>
      Effect.fail(new ApiTooLarge({ message: error.message }));
    const conflict = (error: DraftStaleError | FileExistsError) =>
      Effect.fail(new ApiConflict({ message: error.message }));
    const unresolved = (error: ConfigMissingError | ConfigInvalidError) =>
      Effect.fail(new ApiFailure({ message: error.message }));

    return handlers.handleAll({
      getWorkspaces: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          return yield* workspacesLoader(user.id, req.query.wsId).pipe(Effect.provide(stores));
        }),
      selectWorkspace: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId } = req.payload;
          yield* requireAccess(wsId, user.id);
          yield* userState.setSelectedWorkspace(user.id, wsId);
        }),
      createWorkspace: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          return yield* workspacesStore.createWorkspace(req.payload.name, user.id);
        }),
      deleteWorkspace: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId } = req.query;
          yield* requireAccess(wsId, user.id, "owner");
          const deleted = yield* workspacesStore.deleteWorkspace(wsId, user.id);
          if (!deleted) {
            return yield* Effect.fail(new HttpApiError.NotFound());
          }
        }),
      getFiles: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          yield* requireAccess(req.query.wsId, user.id);
          return yield* fileTreeLoader(user.id, req.query.wsId).pipe(Effect.provide(stores));
        }),
      selectFile: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, fileId } = req.payload;
          yield* requireAccess(wsId, user.id);
          yield* userState.setSelectedFile(user.id, wsId, fileId);
        }),
      getFileContent: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, fileId, versionId } = req.query;
          yield* requireAccess(wsId, user.id);
          return yield* fileContentLoader(wsId, fileId, versionId).pipe(
            Effect.provide(stores),
            Effect.catchTag("FileMissingError", notFound),
          );
        }),
      getFileVersions: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, fileId } = req.query;
          yield* requireAccess(wsId, user.id);
          return yield* fileVersionsLoader(wsId, fileId).pipe(
            Effect.provide(stores),
            Effect.catchTag("FileMissingError", notFound),
          );
        }),
      saveFileDraft: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, fileId, baseVersionId, content } = req.payload;
          yield* requireAccess(wsId, user.id);
          return yield* files.writeDraft(fileId, baseVersionId, content);
        }).pipe(
          Effect.provideService(WorkspaceId, { wsId: req.payload.wsId }),
          Effect.catchTags({
            FileMissingError: notFound,
            DraftStaleError: conflict,
            FileTooLargeError: tooLarge,
          }),
        ),
      promoteFileDraft: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, fileId } = req.payload;
          yield* requireAccess(wsId, user.id);
          const { version } = yield* files.promoteDraft(fileId);
          return version;
        }).pipe(
          Effect.provideService(WorkspaceId, { wsId: req.payload.wsId }),
          Effect.catchTag("FileMissingError", notFound),
        ),
      createFile: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path, content, fileId } = req.payload;
          yield* requireAccess(wsId, user.id);
          const created = yield* files.createAt(path, content, fileId);
          return { ...created, created: true };
        }).pipe(
          Effect.provideService(WorkspaceId, { wsId: req.payload.wsId }),
          Effect.catchTags({ FileExistsError: conflict, FileTooLargeError: tooLarge }),
        ),
      upsertFile: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, path, content } = req.payload;
          yield* requireAccess(wsId, user.id);
          return yield* files.writeAt(path, content);
        }).pipe(
          Effect.provideService(WorkspaceId, { wsId: req.payload.wsId }),
          Effect.catchTag("FileTooLargeError", tooLarge),
        ),
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
          const { wsId, fileId } = req.query;
          yield* requireAccess(wsId, user.id);
          return yield* reviewRunsLoader(wsId, fileId).pipe(Effect.provide(stores));
        }),
      getLatestReview: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, fileId, versionId } = req.query;
          yield* requireAccess(wsId, user.id);
          return yield* latestReviewLoader(wsId, fileId, versionId).pipe(
            Effect.provide(stores),
            Effect.catchTag("FileMissingError", notFound),
          );
        }),
      startReview: (req) =>
        Effect.gen(function* () {
          const { user } = yield* UserSession;
          const { wsId, fileId } = req.payload;
          yield* requireAccess(wsId, user.id);
          const runs = yield* ReviewRuns;
          // checked before the draft is saved, so a refused request saves no version; createRun
          // catches a concurrent start
          const running = (yield* runs.listRuns(fileId)).some((run) => run.status === "running");
          if (running) return yield* Effect.fail(new ApiConflict({ message: ALREADY_REVIEWING }));
          const pass = yield* resolveActiveReviewPass.pipe(
            Effect.catchTags({ ConfigMissingError: unresolved, ConfigInvalidError: unresolved }),
          );
          if (Option.isNone(pass)) {
            return yield* Effect.fail(
              new ApiFailure({ message: "No active review pass configured." }),
            );
          }
          // the review reads the latest text, so the draft is saved as a version first
          const { version } = yield* files.promoteDraft(fileId);
          const run = yield* runs
            .createRun({ fileId, versionId: version.id, reviewPassId: pass.value.pass.id })
            .pipe(
              Effect.catchTags({
                // the version was just saved
                FileMissingError: Effect.die,
                ReviewRunActiveError: () =>
                  Effect.fail(new ApiConflict({ message: ALREADY_REVIEWING })),
              }),
            );
          yield* RunDrivers.use((drivers) => drivers.wake({ runId: run.id, wsId }));
          return run;
        }).pipe(
          Effect.provideService(WorkspaceId, { wsId: req.payload.wsId }),
          Effect.provide(stores),
          Effect.catchTag("FileMissingError", notFound),
        ),
    });
  }),
);

const adminHandlers = HttpApiBuilder.group(
  api,
  "admin",
  Effect.fn(function* (handlers) {
    const config = yield* ReviewConfig;
    const runs = yield* ReviewRuns;
    const workspacesStore = yield* Workspaces;
    const OK = { ok: true as const };
    const requireAccess = (wsId: string) =>
      Effect.gen(function* () {
        const { user } = yield* UserSession;
        const allowed = yield* Effect.orDie(workspacesStore.hasAccess(wsId, user.id));
        if (!allowed) {
          return yield* Effect.fail(new HttpApiError.Forbidden());
        }
      });

    return handlers.handleAll({
      getAdminConfig: () => adminConfigLoader().pipe(Effect.provideService(ReviewConfig, config)),
      createCategory: (req) => {
        const category = new Category({ ...req.payload, id: randomId() });
        return config.saveCategory(category).pipe(Effect.as(category));
      },
      updateCategory: (req) => {
        const category = new Category({ ...req.payload, id: req.params.id });
        return config.saveCategory(category).pipe(Effect.as(category));
      },
      deleteCategory: (req) => config.deleteCategory(req.params.id).pipe(Effect.as(OK)),
      createModelPool: (req) => {
        const pool = new ModelPool({ ...req.payload, id: randomId() });
        return config.saveModelPool(pool).pipe(Effect.as(pool));
      },
      updateModelPool: (req) => {
        const pool = new ModelPool({ ...req.payload, id: req.params.id });
        return config.saveModelPool(pool).pipe(Effect.as(pool));
      },
      deleteModelPool: (req) => config.deleteModelPool(req.params.id).pipe(Effect.as(OK)),
      createPrompt: (req) => config.savePrompt(req.payload).pipe(Effect.as(req.payload)),
      updatePrompt: (req) => {
        const prompt = new Prompt({ body: req.payload.body, key: req.params.key });
        return config.savePrompt(prompt).pipe(Effect.as(prompt));
      },
      deletePrompt: (req) => config.deletePrompt(req.params.key).pipe(Effect.as(OK)),
      createReviewPass: (req) => {
        const pass = new ReviewPass({ ...req.payload, id: randomId() });
        return config.saveReviewPass(pass).pipe(Effect.as(pass));
      },
      updateReviewPass: (req) => {
        const pass = new ReviewPass({ ...req.payload, id: req.params.id });
        return config.saveReviewPass(pass).pipe(Effect.as(pass));
      },
      deleteReviewPass: (req) => config.deleteReviewPass(req.params.id).pipe(Effect.as(OK)),
      setActiveReviewPass: (req) =>
        Effect.gen(function* () {
          const { reviewPassId } = req.payload;
          if (!(yield* config.setActiveReviewPass(reviewPassId))) {
            return yield* Effect.fail(new HttpApiError.NotFound());
          }
          return { activeReviewPassId: reviewPassId };
        }),
      deleteReviewRun: (req) =>
        Effect.gen(function* () {
          const { wsId } = req.query;
          yield* requireAccess(wsId);
          yield* runs.deleteRun(req.params.id).pipe(
            Effect.provideService(WorkspaceId, { wsId }),
            Effect.catchTags({
              ReviewRunMissingError: () => Effect.fail(new HttpApiError.NotFound()),
              ReviewRunActiveError: (err) => Effect.fail(new ApiConflict({ message: err.message })),
            }),
          );
          return { runs: 1 };
        }),
      clearReviewRuns: (req) =>
        Effect.gen(function* () {
          const { wsId, fileId, versionId } = req.query;
          yield* requireAccess(wsId);
          const deleted = yield* runs.deleteRuns(fileId, versionId).pipe(
            Effect.provideService(WorkspaceId, { wsId }),
            Effect.catchTag("ReviewRunActiveError", (err) =>
              Effect.fail(new ApiConflict({ message: err.message })),
            ),
          );
          return { runs: deleted };
        }),
      getPassGraph: (req) =>
        Effect.gen(function* () {
          const pass = yield* config
            .getReviewPass(req.params.id)
            .pipe(
              Effect.catchTag("ConfigMissingError", () => Effect.fail(new HttpApiError.NotFound())),
            );
          const resolved = yield* resolveReviewPass(pass).pipe(
            Effect.provideService(ReviewConfig, config),
            Effect.catchTags({
              ConfigMissingError: (err) => Effect.fail(new ApiBadRequest({ message: err.message })),
              ConfigInvalidError: (err) => Effect.fail(new ApiBadRequest({ message: err.message })),
            }),
          );
          const graph = buildReviewGraph(resolved);
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
