import { mapNotNullish, sortBy } from "@std/collections";
import {
  ConcurrentModificationError,
  type Key,
  type PersistenceAdapter,
} from "@/persistence/mod.ts";
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
//   ["workspaces_by_owner", ownerId, wsId]   -> true     (owner's workspaces)
//   ["members_by_ws", wsId, userId]          -> WorkspaceMember
//   ["members_by_user", userId, wsId]        -> true     (user's workspaces)
const USERS = "users";
const USER_EMAILS = "user_emails";
const WORKSPACES = "workspaces";
const WORKSPACES_BY_OWNER = "workspaces_by_owner";
const MEMBERS_BY_WS = "members_by_ws";
const MEMBERS_BY_USER = "members_by_user";

/**
 * Storage for users, workspaces, and memberships over a {@link PersistenceAdapter}.
 *
 * Cross-entity invariants (unique email, workspace + owner membership created
 * together, dual membership indexes) are enforced with atomic `batch` writes and
 * `checks`, so a concurrent conflicting write rejects the whole batch.
 */
export class WorkspaceStore {
  #adapter: PersistenceAdapter;

  constructor(adapter: PersistenceAdapter) {
    this.#adapter = adapter;
  }

  // -- users --

  /**
   * Create a user with a unique email. Throws {@link UserEmailTakenError} on
   * conflict. `data` carries the email plus optional display fields (e.g.
   * from OAuth).
   */
  async createUser(data: UserInput): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: Date.now(),
    };
    const emailKey: Key = [USER_EMAILS, data.email];
    try {
      await this.#adapter.batch(
        [
          { type: "set", key: [USERS, user.id], value: user },
          { type: "set", key: emailKey, value: user.id },
        ],
        // Email must not already exist; the index key must be absent.
        { checks: [{ key: emailKey, versionstamp: null }] },
      );
    } catch (error) {
      if (error instanceof ConcurrentModificationError) {
        throw new UserEmailTakenError(data.email);
      }
      throw error;
    }
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    return (await this.#adapter.get<User>([USERS, id]))?.value;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const userId = (await this.#adapter.get<string>([USER_EMAILS, email]))
      ?.value;
    return userId ? await this.getUser(userId) : undefined;
  }

  /**
   * Patch a user's profile fields (name / picture). Uses optimistic
   * concurrency on the user record; throws {@link ConcurrentModificationError}
   * if the user was modified concurrently. Returns the updated user, or
   * `undefined` if the id is unknown.
   */
  async updateUser(
    id: string,
    changes: UserProfile,
  ): Promise<User | undefined> {
    const key: Key = [USERS, id];
    const entry = await this.#adapter.get<User>(key);
    if (entry === undefined) return undefined;
    const user: User = { ...entry.value, ...changes };
    await this.#adapter.batch([{ type: "set", key, value: user }], {
      checks: [{ key, versionstamp: entry.versionstamp }],
    });
    return user;
  }

  /**
   * Set a user's site-wide {@link UserRole}. Uses optimistic concurrency.
   * Returns the updated user, or `undefined` if the id is unknown.
   */
  async setUserRole(id: string, role: UserRole): Promise<User | undefined> {
    const key: Key = [USERS, id];
    const entry = await this.#adapter.get<User>(key);
    if (entry === undefined) return undefined;
    const user: User = { ...entry.value, role };
    await this.#adapter.batch([{ type: "set", key, value: user }], {
      checks: [{ key, versionstamp: entry.versionstamp }],
    });
    return user;
  }

  /** Whether `user` has the admin role. */
  isAdmin(user: User): boolean {
    return user.role === "admin";
  }

  // -- workspaces --

  /**
   * Create a workspace and an owner membership for `ownerId` atomically.
   * The owner is added as a {@link Role} `"owner"` member in the same batch.
   */
  async createWorkspace(name: string, ownerId: string): Promise<Workspace> {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const workspace: Workspace = { id, name, ownerId, createdAt };
    const ownerMember: WorkspaceMember = {
      wsId: id,
      userId: ownerId,
      role: "owner",
      createdAt,
    };
    await this.#adapter.batch([
      { type: "set", key: [WORKSPACES, id], value: workspace },
      { type: "set", key: [WORKSPACES_BY_OWNER, ownerId, id], value: true },
      { type: "set", key: [MEMBERS_BY_WS, id, ownerId], value: ownerMember },
      { type: "set", key: [MEMBERS_BY_USER, ownerId, id], value: true },
    ]);
    return workspace;
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return (await this.#adapter.get<Workspace>([WORKSPACES, id]))?.value;
  }

  /** List all workspaces a user belongs to (any role). */
  async listWorkspacesForUser(userId: string): Promise<Workspace[]> {
    const { entries } = await this.#adapter.list([MEMBERS_BY_USER, userId]);
    const wsIds = entries.map((e) => String(e.key[2]));
    const results = await this.#adapter.getMany<Workspace>(
      wsIds.map((id) => [WORKSPACES, id]),
    );
    return sortBy(
      mapNotNullish(results, (r) => r?.value),
      (workspace) => workspace.createdAt,
    );
  }

  // -- members --

  /** Add a member, or update their role if already a member (upsert). */
  async addMember(
    wsId: string,
    userId: string,
    role: Role,
  ): Promise<WorkspaceMember> {
    const memberKey: Key = [MEMBERS_BY_WS, wsId, userId];
    const existing = await this.#adapter.get<WorkspaceMember>(memberKey);

    // Refuse to demote the last owner.
    if (existing?.value.role === "owner" && role !== "owner") {
      await this.#assertMultipleOwners(wsId);
    }

    const member: WorkspaceMember = {
      wsId,
      userId,
      role,
      createdAt: existing?.value.createdAt ?? Date.now(),
    };
    await this.#adapter.batch(
      [
        { type: "set", key: memberKey, value: member },
        {
          type: "set",
          key: [MEMBERS_BY_USER, userId, wsId],
          value: true,
        },
      ],
      // Optimistic concurrency: reject if the membership changed since read.
      {
        checks: [
          { key: memberKey, versionstamp: existing?.versionstamp ?? null },
        ],
      },
    );
    return member;
  }

  /** Remove a member. Returns false if they were not a member. */
  async removeMember(wsId: string, userId: string): Promise<boolean> {
    const memberKey: Key = [MEMBERS_BY_WS, wsId, userId];
    const existing = await this.#adapter.get<WorkspaceMember>(memberKey);
    if (!existing) return false;

    // Refuse to remove the last owner.
    if (existing.value.role === "owner") {
      await this.#assertMultipleOwners(wsId);
    }

    await this.#adapter.batch(
      [
        { type: "delete", key: memberKey },
        { type: "delete", key: [MEMBERS_BY_USER, userId, wsId] },
      ],
      { checks: [{ key: memberKey, versionstamp: existing.versionstamp }] },
    );
    return true;
  }

  /** Throw {@link LastOwnerError} if the workspace has only one owner. */
  async #assertMultipleOwners(wsId: string): Promise<void> {
    const members = await this.getMembers(wsId);
    const owners = members.filter((m) => m.role === "owner");
    if (owners.length <= 1) throw new LastOwnerError(wsId);
  }

  /** List all members of a workspace. */
  async getMembers(wsId: string): Promise<WorkspaceMember[]> {
    const { entries } = await this.#adapter.list<WorkspaceMember>([
      MEMBERS_BY_WS,
      wsId,
    ]);
    return sortBy(
      entries.map((e) => e.value),
      (member) => member.createdAt,
    );
  }

  /** Get a specific membership, or undefined if the user is not a member. */
  async getMembership(
    wsId: string,
    userId: string,
  ): Promise<WorkspaceMember | undefined> {
    return (
      await this.#adapter.get<WorkspaceMember>([MEMBERS_BY_WS, wsId, userId])
    )?.value;
  }

  /**
   * Whether `userId` can access `wsId`, optionally requiring a role.
   * `owner` satisfies an `editor` requirement (owner >= editor).
   */
  async hasAccess(wsId: string, userId: string, role?: Role): Promise<boolean> {
    const membership = await this.getMembership(wsId, userId);
    if (!membership) return false;
    if (!role) return true;
    if (role === "editor") return true; // any member can edit
    return membership.role === "owner"; // role === "owner"
  }
}
