import { assertEquals, assertRejects } from "@std/assert";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { WorkspaceStore } from "./store.ts";
import { LastOwnerError, UserEmailTakenError } from "./types.ts";

function createStore() {
  return new WorkspaceStore(new InMemoryAdapter());
}

// -- users --

Deno.test("WorkspaceStore -- create + get user", async () => {
  const store = createStore();
  const user = await store.createUser("alice@example.com", "Alice");
  assertEquals(user.email, "alice@example.com");
  assertEquals(user.name, "Alice");

  assertEquals((await store.getUser(user.id))?.email, "alice@example.com");
  assertEquals((await store.getUserByEmail("alice@example.com"))?.id, user.id);
});

Deno.test("WorkspaceStore -- getUser missing returns undefined", async () => {
  const store = createStore();
  assertEquals(await store.getUser("nope"), undefined);
  assertEquals(await store.getUserByEmail("nobody@example.com"), undefined);
});

Deno.test("WorkspaceStore -- duplicate email is rejected", async () => {
  const store = createStore();
  await store.createUser("bob@example.com");
  await assertRejects(
    () => store.createUser("bob@example.com"),
    UserEmailTakenError,
  );
});

// -- workspaces --

Deno.test("WorkspaceStore -- createWorkspace adds owner membership", async () => {
  const store = createStore();
  const owner = await store.createUser("owner@example.com");
  const ws = await store.createWorkspace("Essays", owner.id);

  assertEquals(ws.name, "Essays");
  assertEquals(ws.ownerId, owner.id);

  assertEquals((await store.getWorkspace(ws.id))?.id, ws.id);
  const membership = await store.getMembership(ws.id, owner.id);
  assertEquals(membership?.role, "owner");
});

Deno.test("WorkspaceStore -- listWorkspacesForUser returns memberships", async () => {
  const store = createStore();
  const alice = await store.createUser("alice@example.com");
  const bob = await store.createUser("bob@example.com");

  const ws1 = await store.createWorkspace("One", alice.id);
  const ws2 = await store.createWorkspace("Two", alice.id);
  await store.createWorkspace("Bobs", bob.id);

  const forAlice = await store.listWorkspacesForUser(alice.id);
  assertEquals(forAlice.map((w) => w.id).sort(), [ws1.id, ws2.id].sort());
  assertEquals((await store.listWorkspacesForUser(bob.id)).length, 1);
});

Deno.test("WorkspaceStore -- getWorkspace missing returns undefined", async () => {
  const store = createStore();
  assertEquals(await store.getWorkspace("missing"), undefined);
});

// -- members --

Deno.test("WorkspaceStore -- addMember + getMembers", async () => {
  const store = createStore();
  const owner = await store.createUser("owner@example.com");
  const editor = await store.createUser("editor@example.com");
  const ws = await store.createWorkspace("WS", owner.id);

  await store.addMember(ws.id, editor.id, "editor");
  const members = await store.getMembers(ws.id);
  assertEquals(members.length, 2);
  assertEquals(members.find((m) => m.userId === editor.id)?.role, "editor");
});

Deno.test("WorkspaceStore -- addMember upserts role", async () => {
  const store = createStore();
  const owner = await store.createUser("owner@example.com");
  const user = await store.createUser("user@example.com");
  const ws = await store.createWorkspace("WS", owner.id);

  await store.addMember(ws.id, user.id, "editor");
  await store.addMember(ws.id, user.id, "owner");

  assertEquals((await store.getMembership(ws.id, user.id))?.role, "owner");
  assertEquals((await store.getMembers(ws.id)).length, 2);
});

Deno.test("WorkspaceStore -- removeMember", async () => {
  const store = createStore();
  const owner = await store.createUser("owner@example.com");
  const user = await store.createUser("user@example.com");
  const ws = await store.createWorkspace("WS", owner.id);
  await store.addMember(ws.id, user.id, "editor");

  assertEquals(await store.removeMember(ws.id, user.id), true);
  assertEquals(await store.getMembership(ws.id, user.id), undefined);
  assertEquals(await store.removeMember(ws.id, user.id), false);
});

// -- access checks --

Deno.test("WorkspaceStore -- hasAccess", async () => {
  const store = createStore();
  const owner = await store.createUser("owner@example.com");
  const editor = await store.createUser("editor@example.com");
  const outsider = await store.createUser("outsider@example.com");
  const ws = await store.createWorkspace("WS", owner.id);
  await store.addMember(ws.id, editor.id, "editor");

  // Any member has access.
  assertEquals(await store.hasAccess(ws.id, owner.id), true);
  assertEquals(await store.hasAccess(ws.id, editor.id), true);
  assertEquals(await store.hasAccess(ws.id, outsider.id), false);

  // editor requirement: owners and editors both satisfy it.
  assertEquals(await store.hasAccess(ws.id, owner.id, "editor"), true);
  assertEquals(await store.hasAccess(ws.id, editor.id, "editor"), true);
  assertEquals(await store.hasAccess(ws.id, outsider.id, "editor"), false);

  // owner requirement: only owners satisfy it.
  assertEquals(await store.hasAccess(ws.id, owner.id, "owner"), true);
  assertEquals(await store.hasAccess(ws.id, editor.id, "owner"), false);
});

// -- last-owner guard --

Deno.test("WorkspaceStore -- cannot remove the last owner", async () => {
  const store = createStore();
  const owner = await store.createUser("owner@example.com");
  const ws = await store.createWorkspace("WS", owner.id);

  await assertRejects(
    () => store.removeMember(ws.id, owner.id),
    LastOwnerError,
  );
  // Owner is still a member.
  assertEquals((await store.getMembership(ws.id, owner.id))?.role, "owner");
});

Deno.test("WorkspaceStore -- cannot demote the last owner via addMember", async () => {
  const store = createStore();
  const owner = await store.createUser("owner@example.com");
  const ws = await store.createWorkspace("WS", owner.id);

  await assertRejects(
    () => store.addMember(ws.id, owner.id, "editor"),
    LastOwnerError,
  );
  assertEquals((await store.getMembership(ws.id, owner.id))?.role, "owner");
});

Deno.test("WorkspaceStore -- can remove an owner when another owner exists", async () => {
  const store = createStore();
  const a = await store.createUser("a@example.com");
  const b = await store.createUser("b@example.com");
  const ws = await store.createWorkspace("WS", a.id);
  await store.addMember(ws.id, b.id, "owner");

  assertEquals(await store.removeMember(ws.id, a.id), true);
  assertEquals(await store.getMembership(ws.id, a.id), undefined);
  assertEquals((await store.getMembership(ws.id, b.id))?.role, "owner");
});
