/** Storage for users, workspaces, and memberships as an Effect service. */

import { Context, type Effect, type Option } from "effect";

import type {
  LastOwnerError,
  Role,
  User,
  UserEmailTakenError,
  UserInput,
  UserMissingError,
  UserProfile,
  UserRole,
  Workspace,
  WorkspaceMember,
} from "./types.ts";

export interface Interface {
  /** Create a user with a unique email; `UserEmailTakenError` on conflict. */
  createUser(data: UserInput): Effect.Effect<User, UserEmailTakenError>;
  getUser(id: string): Effect.Effect<Option.Option<User>>;
  /** Emails match regardless of the case of ASCII letters. */
  getUserByEmail(email: string): Effect.Effect<Option.Option<User>>;
  /** Replace the profile fields; a missing field clears it. */
  updateUser(id: string, changes: UserProfile): Effect.Effect<User, UserMissingError>;
  /** Set the site-wide role of a user. */
  setUserRole(id: string, role: UserRole): Effect.Effect<User, UserMissingError>;
  /** Create a workspace and the owner membership of its creator atomically. */
  createWorkspace(name: string, createdBy: string): Effect.Effect<Workspace>;
  /**
   * Soft-delete a workspace: hide it from listings and access checks, keeping its data for a later
   * restore or retention cleanup. Ownership is the caller's check. `false` when the workspace is
   * missing or already deleted.
   */
  deleteWorkspace(wsId: string, deletedBy: string): Effect.Effect<boolean>;
  /** List the workspaces a user belongs to, with their role in each, without deleted ones. */
  listWorkspacesForUser(userId: string): Effect.Effect<Array<{ workspace: Workspace; role: Role }>>;
  /** Add a member, or update their role if already a member (upsert). */
  addMember(
    wsId: string,
    userId: string,
    role: Role,
  ): Effect.Effect<WorkspaceMember, LastOwnerError>;
  /** Remove a member; `false` if they were not one. */
  removeMember(wsId: string, userId: string): Effect.Effect<boolean, LastOwnerError>;
  /** List all members of a workspace. */
  getMembers(wsId: string): Effect.Effect<ReadonlyArray<WorkspaceMember>>;
  /** Whether `userId` can access `wsId`, optionally requiring a role.
   * `owner` satisfies an `editor` requirement (owner >= editor). False for a deleted workspace. */
  hasAccess(wsId: string, userId: string, role?: Role): Effect.Effect<boolean>;
}

export class Workspaces extends Context.Service<Workspaces, Interface>()(
  "@essayist/core/workspace/Workspaces",
) {}
