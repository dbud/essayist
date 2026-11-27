/**
 * The Workspaces D1 layer over the users, workspaces and workspace_members tables. The last-owner
 * rule is a condition inside the statement that changes a membership, so a concurrent change cannot
 * slip between the check and the write.
 */

import type * as D1Client from "@effect/sql-d1/D1Client";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { Ids } from "#/idsRef.ts";

import { Workspaces } from "./service.ts";
import {
  LastOwnerError,
  Role,
  User,
  type UserInput,
  type UserProfile,
  UserRole,
  UserEmailTakenError,
  Workspace,
  WorkspaceMember,
} from "./types.ts";

/** A profile field as stored: an empty value is no value. */
const present = (value: string | undefined) =>
  Option.filter(Option.fromUndefinedOr(value), (text) => text !== "");

const ById = Schema.Struct({ id: Schema.String });
const ByMember = Schema.Struct({ wsId: Schema.String, userId: Schema.String });

export function layerWorkspacesD1(client: D1Client.D1Client): Layer.Layer<Workspaces> {
  // a taken email inserts no row
  const insertUser = SqlSchema.findOneOption({
    Request: User,
    Result: User,
    execute: (row) =>
      client`INSERT INTO users ${client.insert([row])}
        ON CONFLICT (email) DO NOTHING
        RETURNING *`,
  });

  const findUser = SqlSchema.findOneOption({
    Request: ById,
    Result: User,
    execute: ({ id }) => client`SELECT * FROM users WHERE id = ${id}`,
  });

  const findUserByEmail = SqlSchema.findOneOption({
    Request: Schema.Struct({ email: Schema.String }),
    Result: User,
    execute: ({ email }) => client`SELECT * FROM users WHERE email = ${email}`,
  });

  const updateProfile = SqlSchema.findOneOption({
    Request: Schema.Struct({
      id: Schema.String,
      name: Schema.NullOr(Schema.String),
      picture: Schema.NullOr(Schema.String),
    }),
    Result: User,
    execute: ({ id, name, picture }) =>
      client`UPDATE users
        SET name = ${name}, picture = ${picture}
        WHERE id = ${id}
        RETURNING *`,
  });

  const updateRole = SqlSchema.findOneOption({
    Request: Schema.Struct({ id: Schema.String, role: UserRole }),
    Result: User,
    execute: ({ id, role }) => client`UPDATE users SET role = ${role} WHERE id = ${id} RETURNING *`,
  });

  const insertWorkspace = SqlSchema.void({
    Request: Schema.Struct({ workspace: Workspace, owner: WorkspaceMember }),
    execute: ({ workspace, owner }) =>
      client.batch([
        client`INSERT INTO workspaces ${client.insert([workspace])}`,
        client`INSERT INTO workspace_members ${client.insert([owner])}`,
      ]),
  });

  const findWorkspace = SqlSchema.findOneOption({
    Request: ById,
    Result: Workspace,
    execute: ({ id }) => client`SELECT * FROM workspaces WHERE id = ${id}`,
  });

  const markDeleted = SqlSchema.findOneOption({
    Request: Schema.Struct({
      id: Schema.String,
      deletedAt: Schema.DateTimeUtcFromString,
      deletedBy: Schema.String,
    }),
    Result: ById,
    execute: ({ id, deletedAt, deletedBy }) =>
      client`UPDATE workspaces
        SET deletedAt = ${deletedAt}, deletedBy = ${deletedBy}
        WHERE id = ${id} AND deletedAt IS NULL
        RETURNING id`,
  });

  const findMemberWorkspaces = SqlSchema.findAll({
    Request: Schema.Struct({ userId: Schema.String }),
    Result: Schema.Struct({ ...Workspace.fields, memberRole: Role }),
    execute: ({ userId }) =>
      client`SELECT w.*, m.role AS memberRole
        FROM workspace_members m JOIN workspaces w ON w.id = m.wsId
        WHERE m.userId = ${userId} AND w.deletedAt IS NULL
        ORDER BY w.createdAt`,
  });

  const findMembers = SqlSchema.findAll({
    Request: Schema.Struct({ wsId: Schema.String }),
    Result: WorkspaceMember,
    execute: ({ wsId }) =>
      client`SELECT * FROM workspace_members WHERE wsId = ${wsId} ORDER BY createdAt`,
  });

  const findMember = SqlSchema.findOneOption({
    Request: ByMember,
    Result: WorkspaceMember,
    execute: ({ wsId, userId }) =>
      client`SELECT * FROM workspace_members WHERE wsId = ${wsId} AND userId = ${userId}`,
  });

  // only a member of a workspace that is not deleted has a role here
  const findAccess = SqlSchema.findOneOption({
    Request: ByMember,
    Result: Schema.Struct({ role: Role }),
    execute: ({ wsId, userId }) =>
      client`SELECT m.role
        FROM workspace_members m JOIN workspaces w ON w.id = m.wsId
        WHERE m.wsId = ${wsId} AND m.userId = ${userId} AND w.deletedAt IS NULL`,
  });

  // demoting the last owner updates no row
  const upsertMember = SqlSchema.findOneOption({
    Request: WorkspaceMember,
    Result: WorkspaceMember,
    execute: (row) =>
      client`INSERT INTO workspace_members ${client.insert([row])}
        ON CONFLICT (wsId, userId) DO UPDATE SET role = excluded.role
        WHERE excluded.role = 'owner' OR workspace_members.role <> 'owner'
          OR (SELECT count(*) FROM workspace_members
            WHERE wsId = ${row.wsId} AND role = 'owner') > 1
        RETURNING *`,
  });

  // removing the last owner deletes no row
  const deleteMember = SqlSchema.findOneOption({
    Request: ByMember,
    Result: Schema.Struct({ role: Role }),
    execute: ({ wsId, userId }) =>
      client`DELETE FROM workspace_members
        WHERE wsId = ${wsId} AND userId = ${userId}
          AND (role <> 'owner' OR (SELECT count(*) FROM workspace_members
            WHERE wsId = ${wsId} AND role = 'owner') > 1)
        RETURNING role`,
  });

  const orUndefined = <A, E>(effect: Effect.Effect<Option.Option<A>, E>) =>
    effect.pipe(Effect.map(Option.getOrUndefined), Effect.orDie);

  const createUser = (data: UserInput) =>
    Effect.gen(function* () {
      const ids = yield* Ids;
      const user = new User({
        id: ids.next(),
        email: data.email,
        name: present(data.name),
        picture: present(data.picture),
        role: "writer",
        createdAt: yield* DateTime.now,
      });
      const inserted = yield* Effect.orDie(insertUser(user));
      if (Option.isNone(inserted)) {
        return yield* Effect.fail(new UserEmailTakenError({ email: data.email }));
      }
      return inserted.value;
    });

  const getUser = (id: string) => orUndefined(findUser({ id }));

  const getUserByEmail = (email: string) => orUndefined(findUserByEmail({ email }));

  const updateUser = (id: string, changes: UserProfile) =>
    orUndefined(
      updateProfile({
        id,
        name: Option.getOrNull(present(changes.name)),
        picture: Option.getOrNull(present(changes.picture)),
      }),
    );

  const setUserRole = (id: string, role: UserRole) => orUndefined(updateRole({ id, role }));

  const isAdmin = (user: User): boolean => user.role === "admin";

  const createWorkspace = (name: string, createdBy: string) =>
    Effect.gen(function* () {
      const ids = yield* Ids;
      const createdAt = yield* DateTime.now;
      const workspace = new Workspace({
        id: ids.next(),
        name,
        createdBy,
        createdAt,
        deletedAt: Option.none(),
        deletedBy: Option.none(),
      });
      const owner = new WorkspaceMember({
        wsId: workspace.id,
        userId: createdBy,
        role: "owner",
        createdAt,
      });
      yield* Effect.orDie(insertWorkspace({ workspace, owner }));
      return workspace;
    });

  const getWorkspace = (id: string) => orUndefined(findWorkspace({ id }));

  const deleteWorkspace = (wsId: string, deletedBy: string) =>
    Effect.gen(function* () {
      const deletedAt = yield* DateTime.now;
      const row = yield* Effect.orDie(markDeleted({ id: wsId, deletedAt, deletedBy }));
      return Option.isSome(row);
    });

  const listWorkspacesForUser = (userId: string) =>
    findMemberWorkspaces({ userId }).pipe(
      Effect.map((rows) =>
        rows.map(({ memberRole, ...fields }) => ({
          workspace: new Workspace(fields),
          role: memberRole,
        })),
      ),
      Effect.orDie,
    );

  const getMembers = (wsId: string) => Effect.orDie(findMembers({ wsId }));

  const getMembership = (wsId: string, userId: string) => orUndefined(findMember({ wsId, userId }));

  const addMember = (wsId: string, userId: string, role: Role) =>
    Effect.gen(function* () {
      const member = new WorkspaceMember({ wsId, userId, role, createdAt: yield* DateTime.now });
      const row = yield* Effect.orDie(upsertMember(member));
      if (Option.isNone(row)) return yield* Effect.fail(new LastOwnerError({ wsId }));
      return row.value;
    });

  const removeMember = (wsId: string, userId: string) =>
    Effect.gen(function* () {
      const removed = yield* Effect.orDie(deleteMember({ wsId, userId }));
      if (Option.isSome(removed)) return true;
      // nothing was deleted: either not a member, or the last owner
      const member = yield* getMembership(wsId, userId);
      if (member?.role === "owner") return yield* Effect.fail(new LastOwnerError({ wsId }));
      return false;
    });

  const hasAccess = (wsId: string, userId: string, role?: Role) =>
    Effect.gen(function* () {
      const access = yield* Effect.orDie(findAccess({ wsId, userId }));
      if (Option.isNone(access)) return false;
      // owner satisfies an editor requirement
      return role !== "owner" || access.value.role === "owner";
    });

  return Layer.succeed(
    Workspaces,
    Workspaces.of({
      createUser,
      getUser,
      getUserByEmail,
      updateUser,
      setUserRole,
      isAdmin,
      createWorkspace,
      getWorkspace,
      deleteWorkspace,
      listWorkspacesForUser,
      addMember,
      removeMember,
      getMembers,
      getMembership,
      hasAccess,
    }),
  );
}
