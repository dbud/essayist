import { assertEquals, assertInstanceOf } from "@std/assert";
import { Effect, Option, Result } from "effect";
import { test } from "vitest";

import { testLayerD1 } from "#/persistence/testing/d1.ts";

import { Workspaces } from "./service.ts";
import { LastOwnerError, UserEmailTakenError, type WorkspaceMember } from "./types.ts";
import { layerWorkspacesD1 } from "./workspaces_d1.ts";

test("Workspaces -- create + get user", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const user = yield* store.createUser({
      email: "alice@example.com",
      name: "Alice",
      picture: "https://example.com/a.png",
    });
    assertEquals(user.email, "alice@example.com");
    assertEquals(user.name, Option.some("Alice"));
    assertEquals(user.picture, Option.some("https://example.com/a.png"));
    assertEquals(user.role, "writer");

    assertEquals((yield* store.getUser(user.id))?.email, "alice@example.com");
    assertEquals((yield* store.getUserByEmail("alice@example.com"))?.id, user.id);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- updateUser replaces profile fields", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const created = yield* store.createUser({ email: "alice@example.com" });
    const updated = yield* store.updateUser(created.id, {
      name: "Alice",
      picture: "https://example.com/a.png",
    });
    assertEquals(updated?.name, Option.some("Alice"));
    assertEquals((yield* store.getUser(created.id))?.name, Option.some("Alice"));
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- updateUser clears a missing or empty field", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const created = yield* store.createUser({
      email: "alice@example.com",
      name: "Alice",
      picture: "https://example.com/a.png",
    });
    const updated = yield* store.updateUser(created.id, { name: "" });
    assertEquals(updated?.name, Option.none());
    assertEquals(updated?.picture, Option.none());
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- updateUser returns undefined for an unknown id", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    assertEquals(yield* store.updateUser("nope", { name: "x" }), undefined);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- setUserRole grants admin", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const created = yield* store.createUser({ email: "alice@example.com" });
    assertEquals(store.isAdmin(created), false);

    const updated = yield* store.setUserRole(created.id, "admin");
    assertEquals(updated?.role, "admin");
    if (updated) assertEquals(store.isAdmin(updated), true);
    assertEquals((yield* store.getUser(created.id))?.role, "admin");
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- setUserRole returns undefined for an unknown id", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    assertEquals(yield* store.setUserRole("nope", "admin"), undefined);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- a missing user reads as undefined", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    assertEquals(yield* store.getUser("nope"), undefined);
    assertEquals(yield* store.getUserByEmail("nobody@example.com"), undefined);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- a duplicate email is rejected", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    yield* store.createUser({ email: "bob@example.com" });
    const outcome = yield* Effect.result(store.createUser({ email: "bob@example.com" }));
    if (Result.isSuccess(outcome)) {
      throw new Error("a duplicate email was accepted");
    }
    assertInstanceOf(outcome.failure, UserEmailTakenError);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- emails match regardless of case", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const bob = yield* store.createUser({ email: "bob@example.com" });
    assertEquals((yield* store.getUserByEmail("Bob@Example.com"))?.id, bob.id);
    const outcome = yield* Effect.result(store.createUser({ email: "BOB@example.com" }));
    if (Result.isSuccess(outcome)) {
      throw new Error("an email differing only in case was accepted");
    }
    assertInstanceOf(outcome.failure, UserEmailTakenError);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

// workspaces
test("Workspaces -- createWorkspace adds the owner membership", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const ws = yield* store.createWorkspace("Essays", owner.id);
    assertEquals(ws.name, "Essays");
    assertEquals(ws.createdBy, owner.id);

    assertEquals((yield* store.getWorkspace(ws.id))?.id, ws.id);
    const membership = yield* store.getMembership(ws.id, owner.id);
    assertEquals(membership?.role, "owner");
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- listWorkspacesForUser returns memberships", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const alice = yield* store.createUser({ email: "alice@example.com" });
    const bob = yield* store.createUser({ email: "bob@example.com" });

    const ws1 = yield* store.createWorkspace("One", alice.id);
    const ws2 = yield* store.createWorkspace("Two", alice.id);
    yield* store.createWorkspace("Bobs", bob.id);

    const forAlice = yield* store.listWorkspacesForUser(alice.id);
    assertEquals(
      forAlice.map(({ workspace }) => workspace.id).toSorted(),
      [ws1.id, ws2.id].toSorted(),
    );
    assertEquals(
      forAlice.map(({ role }) => role),
      ["owner", "owner"],
    );
    assertEquals((yield* store.listWorkspacesForUser(bob.id)).length, 1);

    yield* store.addMember(ws1.id, bob.id, "editor");
    const forBob = yield* store.listWorkspacesForUser(bob.id);
    assertEquals(forBob.find(({ workspace }) => workspace.id === ws1.id)?.role, "editor");
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- a missing workspace reads as undefined", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    assertEquals(yield* store.getWorkspace("missing"), undefined);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

// members
test("Workspaces -- addMember + getMembers", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const editor = yield* store.createUser({ email: "editor@example.com" });
    const ws = yield* store.createWorkspace("WS", owner.id);

    const member = yield* store.addMember(ws.id, editor.id, "editor");
    assertEquals(member.role, "editor");
    const members: WorkspaceMember[] = yield* store.getMembers(ws.id);
    assertEquals(members.length, 2);
    assertEquals(members.find((m) => m.userId === editor.id)?.role, "editor");
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- addMember upserts the role", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const user = yield* store.createUser({ email: "user@example.com" });
    const ws = yield* store.createWorkspace("WS", owner.id);

    yield* store.addMember(ws.id, user.id, "editor");
    yield* store.addMember(ws.id, user.id, "owner");

    assertEquals((yield* store.getMembership(ws.id, user.id))?.role, "owner");
    assertEquals((yield* store.getMembers(ws.id)).length, 2);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- removeMember", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const user = yield* store.createUser({ email: "user@example.com" });
    const ws = yield* store.createWorkspace("WS", owner.id);
    yield* store.addMember(ws.id, user.id, "editor");

    assertEquals(yield* store.removeMember(ws.id, user.id), true);
    assertEquals(yield* store.getMembership(ws.id, user.id), undefined);
    assertEquals(yield* store.removeMember(ws.id, user.id), false);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

// access checks
test("Workspaces -- hasAccess", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const editor = yield* store.createUser({ email: "editor@example.com" });
    const outsider = yield* store.createUser({ email: "outsider@example.com" });
    const ws = yield* store.createWorkspace("WS", owner.id);
    yield* store.addMember(ws.id, editor.id, "editor");

    // Any member has access.
    assertEquals(yield* store.hasAccess(ws.id, owner.id), true);
    assertEquals(yield* store.hasAccess(ws.id, editor.id), true);
    assertEquals(yield* store.hasAccess(ws.id, outsider.id), false);

    // Editor requirement: owners and editors both satisfy it.
    assertEquals(yield* store.hasAccess(ws.id, owner.id, "editor"), true);
    assertEquals(yield* store.hasAccess(ws.id, editor.id, "editor"), true);
    assertEquals(yield* store.hasAccess(ws.id, outsider.id, "editor"), false);

    // Owner requirement: only owners satisfy it.
    assertEquals(yield* store.hasAccess(ws.id, owner.id, "owner"), true);
    assertEquals(yield* store.hasAccess(ws.id, editor.id, "owner"), false);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

// last-owner guard
test("Workspaces -- the last owner cannot be removed", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const ws = yield* store.createWorkspace("WS", owner.id);

    const outcome = yield* Effect.result(store.removeMember(ws.id, owner.id));
    if (Result.isSuccess(outcome)) {
      throw new Error("the last owner was removed");
    }
    assertInstanceOf(outcome.failure, LastOwnerError);
    // Owner is still a member.
    assertEquals((yield* store.getMembership(ws.id, owner.id))?.role, "owner");
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- the last owner cannot be demoted via addMember", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const ws = yield* store.createWorkspace("WS", owner.id);

    const outcome = yield* Effect.result(store.addMember(ws.id, owner.id, "editor"));
    if (Result.isSuccess(outcome)) {
      throw new Error("the last owner was demoted");
    }
    assertInstanceOf(outcome.failure, LastOwnerError);
    assertEquals((yield* store.getMembership(ws.id, owner.id))?.role, "owner");
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- an owner can be removed when another owner exists", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const a = yield* store.createUser({ email: "a@example.com" });
    const b = yield* store.createUser({ email: "b@example.com" });
    const ws = yield* store.createWorkspace("WS", a.id);
    yield* store.addMember(ws.id, b.id, "owner");

    assertEquals(yield* store.removeMember(ws.id, a.id), true);
    assertEquals(yield* store.getMembership(ws.id, a.id), undefined);
    assertEquals((yield* store.getMembership(ws.id, b.id))?.role, "owner");
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- deleteWorkspace hides the workspace from listings and access", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const editor = yield* store.createUser({ email: "editor@example.com" });
    const kept = yield* store.createWorkspace("Kept", owner.id);
    const gone = yield* store.createWorkspace("Gone", owner.id);
    yield* store.addMember(gone.id, editor.id, "editor");

    assertEquals(yield* store.deleteWorkspace(gone.id, owner.id), true);

    assertEquals(
      (yield* store.listWorkspacesForUser(owner.id)).map(({ workspace }) => workspace.id),
      [kept.id],
    );
    assertEquals(yield* store.listWorkspacesForUser(editor.id), []);
    assertEquals(yield* store.hasAccess(gone.id, owner.id), false);
    assertEquals(yield* store.hasAccess(gone.id, editor.id), false);
    assertEquals(yield* store.hasAccess(kept.id, owner.id, "owner"), true);

    // the record and memberships stay for a restore
    const record = yield* store.getWorkspace(gone.id);
    assertEquals(record?.deletedBy, Option.some(owner.id));
    assertEquals(record !== undefined && Option.isSome(record.deletedAt), true);
    assertEquals((yield* store.getMembers(gone.id)).length, 2);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});

test("Workspaces -- deleteWorkspace is false for a missing or already deleted workspace", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const ws = yield* store.createWorkspace("Gone", owner.id);

    assertEquals(yield* store.deleteWorkspace("nope", owner.id), false);
    assertEquals(yield* store.deleteWorkspace(ws.id, owner.id), true);
    assertEquals(yield* store.deleteWorkspace(ws.id, owner.id), false);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerWorkspacesD1)));
});
