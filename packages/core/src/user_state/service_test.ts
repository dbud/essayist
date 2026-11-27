import { assertEquals } from "@std/assert";
import { Duration, Effect, Layer, Option } from "effect";
import { TestClock } from "effect/testing";
import { test } from "vitest";

import { testLayerD1 } from "#/d1/testing.ts";
import { layerFilesD1 } from "#/files/files_d1.ts";
import { Files } from "#/files/service.ts";
import { Workspaces } from "#/workspace/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";
import { layerWorkspacesD1 } from "#/workspace/workspaces_d1.ts";

import { UserState } from "./service.ts";
import { layerUserStateD1 } from "./user_state_d1.ts";

const layer = testLayerD1((client) =>
  Layer.mergeAll(layerUserStateD1(client), layerWorkspacesD1(client), layerFilesD1(client)),
);

const run = <A, E>(program: Effect.Effect<A, E, UserState | Workspaces | Files>) =>
  Effect.runPromise(program.pipe(Effect.provide(TestClock.layer()), Effect.provide(layer)));

/** A user who owns a workspace for each of the names. */
const userWith = (email: string, ...names: string[]) =>
  Effect.gen(function* () {
    const workspaces = yield* Workspaces;
    const user = yield* Effect.orDie(workspaces.createUser({ email }));
    const ids: string[] = [];
    for (const name of names) ids.push((yield* workspaces.createWorkspace(name, user.id)).id);
    return { userId: user.id, ids };
  });

/** Open a workspace a second after the last open, so each open is later than the one before. */
const open = (userId: string, wsId: string) =>
  Effect.andThen(
    TestClock.adjust(Duration.seconds(1)),
    UserState.use((state) => state.setSelectedWorkspace(userId, wsId)),
  );

const createFile = (wsId: string, path: string) =>
  Files.use((files) => files.createAt(path, "text")).pipe(
    Effect.provideService(WorkspaceId, { wsId }),
    Effect.orDie,
  );

test("UserState -- the selected workspace is the one opened last", async () => {
  await run(
    Effect.gen(function* () {
      const state = yield* UserState;
      const { userId, ids } = yield* userWith("a@example.com", "One", "Two");
      assertEquals(yield* state.getSelectedWorkspace(userId), Option.none());
      yield* open(userId, ids[0]);
      yield* open(userId, ids[1]);
      assertEquals(yield* state.getSelectedWorkspace(userId), Option.some(ids[1]));
      yield* open(userId, ids[0]);
      assertEquals(yield* state.getSelectedWorkspace(userId), Option.some(ids[0]));
    }),
  );
});

test("UserState -- leaving the selected workspace selects the one opened before", async () => {
  await run(
    Effect.gen(function* () {
      const workspaces = yield* Workspaces;
      const { userId: owner, ids } = yield* userWith("owner@example.com", "Shared");
      const { userId, ids: own } = yield* userWith("member@example.com", "Own");
      yield* Effect.orDie(workspaces.addMember(ids[0], userId, "editor"));
      yield* open(userId, own[0]);
      yield* open(userId, ids[0]);

      yield* Effect.orDie(workspaces.removeMember(ids[0], userId));
      const state = yield* UserState;
      assertEquals(yield* state.getSelectedWorkspace(userId), Option.some(own[0]));
      assertEquals(yield* state.getSelectedWorkspace(owner), Option.none());
    }),
  );
});

test("UserState -- a deleted workspace is never the selected one", async () => {
  await run(
    Effect.gen(function* () {
      const { userId, ids } = yield* userWith("a@example.com", "Kept", "Gone");
      yield* open(userId, ids[0]);
      yield* open(userId, ids[1]);
      yield* Workspaces.use((workspaces) => workspaces.deleteWorkspace(ids[1], userId));
      assertEquals(
        yield* UserState.use((state) => state.getSelectedWorkspace(userId)),
        Option.some(ids[0]),
      );
    }),
  );
});

test("UserState -- the selected file is kept per workspace", async () => {
  await run(
    Effect.gen(function* () {
      const state = yield* UserState;
      const { userId, ids } = yield* userWith("a@example.com", "One", "Two");
      yield* createFile(ids[0], "a.md");
      yield* createFile(ids[0], "c.md");
      yield* createFile(ids[1], "b.md");
      assertEquals(yield* state.getSelectedFile(userId, ids[0]), Option.none());

      yield* state.setSelectedFile(userId, ids[0], "a.md");
      yield* state.setSelectedFile(userId, ids[1], "b.md");
      assertEquals(yield* state.getSelectedFile(userId, ids[0]), Option.some("a.md"));
      assertEquals(yield* state.getSelectedFile(userId, ids[1]), Option.some("b.md"));
      yield* state.setSelectedFile(userId, ids[0], "c.md");
      assertEquals(yield* state.getSelectedFile(userId, ids[0]), Option.some("c.md"));
    }),
  );
});

test("UserState -- a path with no file selects nothing", async () => {
  await run(
    Effect.gen(function* () {
      const state = yield* UserState;
      const { userId, ids } = yield* userWith("a@example.com", "One");
      yield* createFile(ids[0], "a.md");
      yield* state.setSelectedFile(userId, ids[0], "a.md");
      yield* state.setSelectedFile(userId, ids[0], "missing.md");
      assertEquals(yield* state.getSelectedFile(userId, ids[0]), Option.some("a.md"));
    }),
  );
});

test("UserState -- users are isolated", async () => {
  await run(
    Effect.gen(function* () {
      const state = yield* UserState;
      const workspaces = yield* Workspaces;
      const { userId: first, ids } = yield* userWith("a@example.com", "Shared");
      const { userId: second } = yield* userWith("b@example.com");
      yield* Effect.orDie(workspaces.addMember(ids[0], second, "editor"));
      yield* createFile(ids[0], "a.md");
      yield* open(first, ids[0]);
      yield* state.setSelectedFile(first, ids[0], "a.md");
      assertEquals(yield* state.getSelectedWorkspace(second), Option.none());
      assertEquals(yield* state.getSelectedFile(second, ids[0]), Option.none());
    }),
  );
});
