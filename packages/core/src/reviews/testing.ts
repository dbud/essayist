/** Fixtures for tests of the review layers: a database, a workspace, and files under review. */

import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Option } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";

import { ReviewConfig } from "#/config/service.ts";
import { Category } from "#/config/types.ts";
import { type CoreServices, layerCoreD1 } from "#/d1/layer.ts";
import { d1SqliteShim } from "#/d1/sqlite.ts";
import { migratedDatabase, testLayerD1 } from "#/d1/testing.ts";
import { Files } from "#/files/service.ts";
import { Workspaces } from "#/workspace/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { ReviewRuns } from "./service.ts";

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
  program: (other: InOther) => Effect.Effect<A, E, CoreServices | WorkspaceId>,
): Promise<A> {
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* seedCategory;
      const home = yield* newWorkspace("Essays");
      const second = yield* newWorkspace("Other");
      const other: InOther = (effect) =>
        Effect.provideService(effect, WorkspaceId, { wsId: second });
      return yield* Effect.provideService(program(other), WorkspaceId, { wsId: home });
    }).pipe(Effect.provide(testLayerD1(layerCoreD1))),
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
  const env = layerCoreD1(client);
  const wsId = await Effect.runPromise(
    Effect.provide(Effect.andThen(seedCategory, newWorkspace()), env),
  );
  return { db, client, env, wsId };
}
