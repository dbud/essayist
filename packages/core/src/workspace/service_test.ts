import { assertEquals, assertInstanceOf } from "@std/assert";
import { Effect, Layer, Result } from "effect";
import { Persistence, type PersistenceError } from "@/persistence/mod.ts";
import { Workspaces } from "./service.ts";
import {
  LastOwnerError,
  UserEmailTakenError,
  type WorkspaceMember,
} from "./types.ts";

function makeLayer(): Layer.Layer<Workspaces, PersistenceError> {
  return Layer.provide(Workspaces.layerNoDeps, Persistence.layerKv(":memory:"));
}

// -- users --

Deno.test("Workspaces -- create + get user", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const user = yield* store.createUser({
      email: "alice@example.com",
      name: "Alice",
      picture: "https://example.com/a.png",
    });
    assertEquals(user.email, "alice@example.com");
    assertEquals(user.name, "Alice");
    assertEquals(user.picture, "https://example.com/a.png");

    assertEquals((yield* store.getUser(user.id))?.email, "alice@example.com");
    assertEquals(
      (yield* store.getUserByEmail("alice@example.com"))?.id,
      user.id,
    );
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- updateUser patches profile fields", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const created = yield* store.createUser({ email: "alice@example.com" });
    const updated = yield* store.updateUser(created.id, {
      name: "Alice",
      picture: "https://example.com/a.png",
    });
    assertEquals(updated?.name, "Alice");
    assertEquals((yield* store.getUser(created.id))?.name, "Alice");
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- updateUser returns undefined for an unknown id", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    assertEquals(yield* store.updateUser("nope", { name: "x" }), undefined);
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- setUserRole grants admin", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const created = yield* store.createUser({ email: "alice@example.com" });
    assertEquals(store.isAdmin(created), false);

    const updated = yield* store.setUserRole(created.id, "admin");
    assertEquals(updated?.role, "admin");
    if (updated) assertEquals(store.isAdmin(updated), true);
    assertEquals((yield* store.getUser(created.id))?.role, "admin");
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- setUserRole returns undefined for an unknown id", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    assertEquals(yield* store.setUserRole("nope", "admin"), undefined);
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- a missing user reads as undefined", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    assertEquals(yield* store.getUser("nope"), undefined);
    assertEquals(yield* store.getUserByEmail("nobody@example.com"), undefined);
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- a duplicate email is rejected", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    yield* store.createUser({ email: "bob@example.com" });
    const outcome = yield* Effect.result(
      store.createUser({ email: "bob@example.com" }),
    );
    if (Result.isSuccess(outcome)) {
      throw new Error("a duplicate email was accepted");
    }
    assertInstanceOf(outcome.failure, UserEmailTakenError);
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

// -- workspaces --

Deno.test("Workspaces -- createWorkspace adds the owner membership", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const ws = yield* store.createWorkspace("Essays", owner.id);
    assertEquals(ws.name, "Essays");
    assertEquals(ws.ownerId, owner.id);

    assertEquals((yield* store.getWorkspace(ws.id))?.id, ws.id);
    const membership = yield* store.getMembership(ws.id, owner.id);
    assertEquals(membership?.role, "owner");
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- listWorkspacesForUser returns memberships", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const alice = yield* store.createUser({ email: "alice@example.com" });
    const bob = yield* store.createUser({ email: "bob@example.com" });

    const ws1 = yield* store.createWorkspace("One", alice.id);
    const ws2 = yield* store.createWorkspace("Two", alice.id);
    yield* store.createWorkspace("Bobs", bob.id);

    const forAlice = yield* store.listWorkspacesForUser(alice.id);
    assertEquals(forAlice.map((w) => w.id).sort(), [ws1.id, ws2.id].sort());
    assertEquals((yield* store.listWorkspacesForUser(bob.id)).length, 1);
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- a missing workspace reads as undefined", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    assertEquals(yield* store.getWorkspace("missing"), undefined);
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

// -- members --

Deno.test("Workspaces -- addMember + getMembers", async () => {
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
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- addMember upserts the role", async () => {
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
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- removeMember", async () => {
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
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

// -- access checks --

Deno.test("Workspaces -- hasAccess", async () => {
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
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

// -- last-owner guard --

Deno.test("Workspaces -- the last owner cannot be removed", async () => {
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
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- the last owner cannot be demoted via addMember", async () => {
  const program = Effect.gen(function* () {
    const store = yield* Workspaces;
    const owner = yield* store.createUser({ email: "owner@example.com" });
    const ws = yield* store.createWorkspace("WS", owner.id);

    const outcome = yield* Effect.result(
      store.addMember(ws.id, owner.id, "editor"),
    );
    if (Result.isSuccess(outcome)) {
      throw new Error("the last owner was demoted");
    }
    assertInstanceOf(outcome.failure, LastOwnerError);
    assertEquals((yield* store.getMembership(ws.id, owner.id))?.role, "owner");
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("Workspaces -- an owner can be removed when another owner exists", async () => {
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
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});
