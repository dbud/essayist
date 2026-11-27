/** Fixtures for tests of the review layers: a database, a workspace, and files under review. */

import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";

import { layerReviewConfigD1 } from "#/config/config_d1.ts";
import { ReviewConfig } from "#/config/service.ts";
import { Category } from "#/config/types.ts";
import { d1SqliteShim } from "#/d1/sqlite.ts";
import { migratedDatabase, testLayerD1 } from "#/d1/testing.ts";
import { layerFilesD1 } from "#/files/files_d1.ts";
import { Files } from "#/files/service.ts";
import { layerMarksD1 } from "#/marks/marks_d1.ts";
import type { Marks } from "#/marks/service.ts";
import { Workspaces } from "#/workspace/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";
import { layerWorkspacesD1 } from "#/workspace/workspaces_d1.ts";

import type { ReviewJanitor } from "./janitor.ts";
import { layerReviewJanitorD1 } from "./janitor_d1.ts";
import { layerReviewRunsD1 } from "./runs_d1.ts";
import { ReviewRuns } from "./service.ts";
import type { TraceEvents } from "./trace/service.ts";
import { layerTraceEventsD1 } from "./trace/trace_d1.ts";

export type ReviewTestServices =
  | ReviewConfig
  | Files
  | Marks
  | ReviewRuns
  | TraceEvents
  | ReviewJanitor
  | Workspaces;

export function reviewServicesD1(client: D1Client.D1Client): Layer.Layer<ReviewTestServices> {
  const files = layerFilesD1(client);
  return Layer.mergeAll(
    layerReviewConfigD1(client),
    files,
    Layer.provide(layerMarksD1(client), files),
    layerReviewRunsD1(client),
    layerTraceEventsD1(client),
    layerReviewJanitorD1(client),
    layerWorkspacesD1(client),
  );
}

/** Every test database has this category, for the marks that name one. */
export const GRAMMAR = new Category({
  id: "grammar",
  label: "grammar",
  description: Option.none(),
  severity: Option.none(),
  color: Option.none(),
});

const seedCategory = ReviewConfig.use((config) => config.saveCategory(GRAMMAR));

/** Create a workspace with an owner, and return its id. */
export const newWorkspace = (name = "Essays") =>
  Effect.gen(function* () {
    const workspaces = yield* Workspaces;
    const owner = yield* Effect.orDie(workspaces.createUser({ email: `${name}@example.com` }));
    const workspace = yield* Effect.orDie(workspaces.createWorkspace(name, owner.id));
    return workspace.id;
  });

type InOther = <B, F, R>(
  effect: Effect.Effect<B, F, R>,
) => Effect.Effect<B, F, Exclude<R, WorkspaceId>>;

/**
 * Run a program in a fresh workspace of a fresh database. `other` runs a part of the program in a
 * second workspace.
 */
export function runInWorkspace<A, E>(
  program: (other: InOther) => Effect.Effect<A, E, ReviewTestServices | WorkspaceId>,
): Promise<A> {
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* seedCategory;
      const home = yield* newWorkspace("Essays");
      const second = yield* newWorkspace("Other");
      const other: InOther = (effect) =>
        Effect.provideService(effect, WorkspaceId, { wsId: second });
      return yield* Effect.provideService(program(other), WorkspaceId, { wsId: home });
    }).pipe(Effect.provide(testLayerD1(reviewServicesD1))),
  );
}

/** A file with a running review of its first version. */
export const reviewedFile = (content = "hello world", path = "essay.md") =>
  Effect.gen(function* () {
    const { file, version } = yield* Effect.orDie(
      Files.use((files) => files.createAt(path, content)),
    );
    const run = yield* Effect.orDie(
      ReviewRuns.use((runs) =>
        runs.createRun({ fileId: file.id, versionId: version.id, reviewPassId: "essay-review" }),
      ),
    );
    return { file, version, run };
  });

/**
 * A database with a workspace, for a test that runs several programs against it. The `env` layer
 * reads and writes the same database each time it is provided.
 */
export async function openReviewDatabase() {
  const db = migratedDatabase();
  const client = await Effect.runPromise(
    D1Client.make({ db: d1SqliteShim(db) }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)),
  );
  const env = reviewServicesD1(client);
  const wsId = await Effect.runPromise(
    Effect.provide(Effect.andThen(seedCategory, newWorkspace()), env),
  );
  return { db, client, env, wsId };
}
