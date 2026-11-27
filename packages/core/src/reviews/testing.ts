/** Fixtures for tests of the review layers: a database, a workspace, and files under review. */

import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";

import { layerFilesD1 } from "#/files/d1/files_d1.ts";
import { Files } from "#/files/d1/service.ts";
import { layerMarksD1 } from "#/marks/d1/marks_d1.ts";
import type { Marks } from "#/marks/d1/service.ts";
import { d1SqliteShim } from "#/persistence/kv_d1_sqlite.ts";
import { migratedDatabase, testLayerD1 } from "#/persistence/testing/d1.ts";
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
  | Files
  | Marks
  | ReviewRuns
  | TraceEvents
  | ReviewJanitor
  | Workspaces;

export function reviewServicesD1(client: D1Client.D1Client): Layer.Layer<ReviewTestServices> {
  const files = layerFilesD1(client);
  return Layer.mergeAll(
    files,
    Layer.provide(layerMarksD1(client), files),
    layerReviewRunsD1(client),
    layerTraceEventsD1(client),
    layerReviewJanitorD1(client),
    layerWorkspacesD1(client),
  );
}

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
  const wsId = await Effect.runPromise(Effect.provide(newWorkspace(), env));
  return { db, client, env, wsId };
}
