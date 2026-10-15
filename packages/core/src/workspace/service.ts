/**
 * Storage for users, workspaces, and memberships as an Effect service.
 *
 * Cross-entity invariants (unique email, workspace + owner membership
 * created together, dual membership indexes) are enforced with atomic
 * batch writes and concurrency checks, so a concurrent conflicting write
 * rejects the whole batch.
 */

import { mapNotNullish, sortBy } from "@std/collections";
import { Clock, Context, Effect, Layer, Result } from "effect";
import { Ids } from "#/ids.ts";
import {
  ConcurrentModificationError,
  type Key,
  Persistence,
  type PersistenceError,
} from "#/persistence/mod.ts";
import type {
  Role,
  User,
  UserInput,
  UserProfile,
  UserRole,
  Workspace,
  WorkspaceMember,
} from "./types.ts";
import { LastOwnerError, UserEmailTakenError } from "./types.ts";

// Key layout:
//   ["users", userId]                        -> User
//   ["user_emails", email]                   -> userId   (unique-email index)
//   ["workspaces", wsId]                     -> Workspace
//   ["workspaces_by_owner", ownerId, wsId]   -> true
//   ["members_by_ws", wsId, userId]          -> WorkspaceMember
//   ["members_by_user", userId, wsId]        -> true
const USERS = "users";
const USER_EMAILS = "user_emails";
const WORKSPACES = "workspaces";
const WORKSPACES_BY_OWNER = "workspaces_by_owner";
const MEMBERS_BY_WS = "members_by_ws";
const MEMBERS_BY_USER = "members_by_user";

/**
 * The Workspace service contract. Batch writes surfaced an optimistic
 * conflict wherever checks are used, so those error channels carry
 * {@linkcode ConcurrentModificationError} even where a check cannot fail.
 */
export interface Interface {
  /** Create a user with a unique email; `UserEmailTakenError` on conflict. */
  createUser(
    data: UserInput,
  ): Effect.Effect<User, UserEmailTakenError | PersistenceError>;
  getUser(id: string): Effect.Effect<User | undefined, PersistenceError>;
  getUserByEmail(
    email: string,
  ): Effect.Effect<User | undefined, PersistenceError>;
  /** Patch profile fields. `undefined` for an unknown id. */
  updateUser(
    id: string,
    changes: UserProfile,
  ): Effect.Effect<
    User | undefined,
    PersistenceError | ConcurrentModificationError
  >;
  /** Set a user's site-wide role. `undefined` for an unknown id. */
  setUserRole(
    id: string,
    role: UserRole,
  ): Effect.Effect<
    User | undefined,
    PersistenceError | ConcurrentModificationError
  >;
  /** Whether `user` has the admin role. */
  isAdmin(user: User): boolean;
  /** Create a workspace and its owner membership atomically. */
  createWorkspace(
    name: string,
    ownerId: string,
  ): Effect.Effect<Workspace, PersistenceError | ConcurrentModificationError>;
  getWorkspace(
    id: string,
  ): Effect.Effect<Workspace | undefined, PersistenceError>;
  /** List all workspaces a user belongs to (any role). */
  listWorkspacesForUser(
    userId: string,
  ): Effect.Effect<Workspace[], PersistenceError>;
  /** Add a member, or update their role if already a member (upsert). */
  addMember(
    wsId: string,
    userId: string,
    role: Role,
  ): Effect.Effect<
    WorkspaceMember,
    LastOwnerError | PersistenceError | ConcurrentModificationError
  >;
  /** Remove a member; `false` if they were not one. */
  removeMember(
    wsId: string,
    userId: string,
  ): Effect.Effect<
    boolean,
    LastOwnerError | PersistenceError | ConcurrentModificationError
  >;
  /** List all members of a workspace. */
  getMembers(wsId: string): Effect.Effect<WorkspaceMember[], PersistenceError>;
  /** Get a membership, or `undefined` if the user is not a member. */
  getMembership(
    wsId: string,
    userId: string,
  ): Effect.Effect<WorkspaceMember | undefined, PersistenceError>;
  /** Whether `userId` can access `wsId`, optionally requiring a role.
   * `owner` satisfies an `editor` requirement (owner >= editor). */
  hasAccess(
    wsId: string,
    userId: string,
    role?: Role,
  ): Effect.Effect<boolean, PersistenceError>;
}

export class Workspaces extends Context.Service<Workspaces, Interface>()(
  "@essayist/core/workspace/Workspaces",
) {
  /** Requires the {@linkcode Persistence} service; compose with
   * Persistence.layerKv at the composition root. */
  static readonly layerNoDeps: Layer.Layer<Workspaces, never, Persistence> =
    Layer.effect(
      Workspaces,
      Effect.gen(function* () {
        const persistence = yield* Persistence;

        const createUser = (data: UserInput) =>
          Effect.gen(function* () {
            const ids = yield* Ids;
            const createdAt = yield* Clock.currentTimeMillis;
            const user: User = {
              id: ids.next(),
              ...data,
              createdAt,
            };
            const emailKey: Key = [USER_EMAILS, data.email];
            const outcome = yield* Effect.result(
              persistence.batch(
                [
                  { type: "set", key: [USERS, user.id], value: user },
                  { type: "set", key: emailKey, value: user.id },
                ],
                // Email must not already exist; the index key must be absent.
                { checks: [{ key: emailKey, versionstamp: null }] },
              ),
            );
            if (Result.isFailure(outcome)) {
              if (outcome.failure instanceof ConcurrentModificationError) {
                return yield* Effect.fail(
                  new UserEmailTakenError({ email: data.email }),
                );
              }
              return yield* Effect.fail(outcome.failure);
            }
            return user;
          });

        const getUser = (id: string) =>
          persistence
            .get<User>([USERS, id])
            .pipe(Effect.map((entry) => entry?.value));

        const getUserByEmail = (email: string) =>
          Effect.gen(function* () {
            const userId = yield* persistence
              .get<string>([USER_EMAILS, email])
              .pipe(Effect.map((entry) => entry?.value));
            return userId ? yield* getUser(userId) : undefined;
          });

        const updateUser = (id: string, changes: UserProfile) =>
          Effect.gen(function* () {
            const key: Key = [USERS, id];
            const entry = yield* persistence.get<User>(key);
            if (entry === undefined) return undefined;
            const user: User = { ...entry.value, ...changes };
            yield* persistence.batch([{ type: "set", key, value: user }], {
              checks: [{ key, versionstamp: entry.versionstamp }],
            });
            return user;
          });

        const setUserRole = (id: string, role: UserRole) =>
          Effect.gen(function* () {
            const key: Key = [USERS, id];
            const entry = yield* persistence.get<User>(key);
            if (entry === undefined) return undefined;
            const user: User = { ...entry.value, role };
            yield* persistence.batch([{ type: "set", key, value: user }], {
              checks: [{ key, versionstamp: entry.versionstamp }],
            });
            return user;
          });

        const isAdmin = (user: User): boolean => user.role === "admin";

        const createWorkspace = (name: string, ownerId: string) =>
          Effect.gen(function* () {
            const ids = yield* Ids;
            const id = ids.next();
            const createdAt = yield* Clock.currentTimeMillis;
            const workspace: Workspace = { id, name, ownerId, createdAt };
            const ownerMember: WorkspaceMember = {
              wsId: id,
              userId: ownerId,
              role: "owner",
              createdAt,
            };
            return yield* persistence
              .batch([
                { type: "set", key: [WORKSPACES, id], value: workspace },
                {
                  type: "set",
                  key: [WORKSPACES_BY_OWNER, ownerId, id],
                  value: true,
                },
                {
                  type: "set",
                  key: [MEMBERS_BY_WS, id, ownerId],
                  value: ownerMember,
                },
                {
                  type: "set",
                  key: [MEMBERS_BY_USER, ownerId, id],
                  value: true,
                },
              ])
              .pipe(Effect.as(workspace));
          });

        const getWorkspace = (id: string) =>
          persistence
            .get<Workspace>([WORKSPACES, id])
            .pipe(Effect.map((entry) => entry?.value));

        const listWorkspacesForUser = (userId: string) =>
          Effect.gen(function* () {
            const { entries } = yield* persistence.list([
              MEMBERS_BY_USER,
              userId,
            ]);
            const wsIds = entries.map((e) => String(e.key[2]));
            const results = yield* persistence.getMany<Workspace>(
              wsIds.map((id) => [WORKSPACES, id]),
            );
            return sortBy(
              mapNotNullish(results, (r) => r?.value),
              (workspace) => workspace.createdAt,
            );
          });

        const getMembers = (wsId: string) =>
          Effect.gen(function* () {
            const { entries } = yield* persistence.list<WorkspaceMember>([
              MEMBERS_BY_WS,
              wsId,
            ]);
            return sortBy(
              entries.map((e) => e.value),
              (member) => member.createdAt,
            );
          });

        /** Fail with {@linkcode LastOwnerError} if the workspace has only
         * one owner. */
        const assertMultipleOwners = (wsId: string) =>
          Effect.gen(function* () {
            const members = yield* getMembers(wsId);
            const owners = members.filter((m) => m.role === "owner");
            if (owners.length <= 1) {
              return yield* Effect.fail(new LastOwnerError({ wsId }));
            }
          });

        const addMember = (wsId: string, userId: string, role: Role) =>
          Effect.gen(function* () {
            const memberKey: Key = [MEMBERS_BY_WS, wsId, userId];
            const existing = yield* persistence.get<WorkspaceMember>(memberKey);

            // Refuse to demote the last owner.
            if (existing?.value.role === "owner" && role !== "owner") {
              yield* assertMultipleOwners(wsId);
            }

            const member: WorkspaceMember = {
              wsId,
              userId,
              role,
              createdAt:
                existing?.value.createdAt ?? (yield* Clock.currentTimeMillis),
            };
            // Optimistic concurrency: reject if the membership changed since
            // read.
            yield* persistence.batch(
              [
                { type: "set", key: memberKey, value: member },
                {
                  type: "set",
                  key: [MEMBERS_BY_USER, userId, wsId],
                  value: true,
                },
              ],
              {
                checks: [
                  {
                    key: memberKey,
                    versionstamp: existing?.versionstamp ?? null,
                  },
                ],
              },
            );
            return member;
          });

        const removeMember = (wsId: string, userId: string) =>
          Effect.gen(function* () {
            const memberKey: Key = [MEMBERS_BY_WS, wsId, userId];
            const existing = yield* persistence.get<WorkspaceMember>(memberKey);
            if (!existing) return false;

            // Refuse to remove the last owner.
            if (existing.value.role === "owner") {
              yield* assertMultipleOwners(wsId);
            }

            yield* persistence.batch(
              [
                { type: "delete", key: memberKey },
                { type: "delete", key: [MEMBERS_BY_USER, userId, wsId] },
              ],
              {
                checks: [
                  { key: memberKey, versionstamp: existing.versionstamp },
                ],
              },
            );
            return true;
          });

        const getMembership = (wsId: string, userId: string) =>
          persistence
            .get<WorkspaceMember>([MEMBERS_BY_WS, wsId, userId])
            .pipe(Effect.map((entry) => entry?.value));

        const hasAccess = (wsId: string, userId: string, role?: Role) =>
          Effect.gen(function* () {
            const membership = yield* getMembership(wsId, userId);
            if (!membership) return false;
            if (!role) return true;
            if (role === "editor") return true; // any member can edit
            return membership.role === "owner"; // role === "owner"
          });

        return Workspaces.of({
          createUser,
          getUser,
          getUserByEmail,
          updateUser,
          setUserRole,
          isAdmin,
          createWorkspace,
          getWorkspace,
          listWorkspacesForUser,
          addMember,
          removeMember,
          getMembers,
          getMembership,
          hasAccess,
        });
      }),
    );
}
