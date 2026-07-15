import {
  ConcurrentModificationError,
  type Key,
  type PersistenceAdapter,
} from "../vfs/persistence.ts";
import type { Role, User, Workspace, WorkspaceMember } from "./types.ts";
import { UserEmailTakenError } from "./types.ts";

// Key layout (all top-level parts are distinct to avoid prefix collisions):
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

  /** Create a user with a unique email. Throws {@link UserEmailTakenError} on conflict. */
  async createUser(email: string, name?: string): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      email,
      name,
      createdAt: Date.now(),
    };
    const emailKey: Key = [USER_EMAILS, email];
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
        throw new UserEmailTakenError(email);
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
      workspaceId: id,
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
    return results
      .filter(
        (r): r is { key: Key; value: Workspace; versionstamp: string } =>
          r !== undefined,
      )
      .map((r) => r.value)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  // -- members --

  /** Add a member, or update their role if already a member (upsert). */
  async addMember(
    workspaceId: string,
    userId: string,
    role: Role,
  ): Promise<WorkspaceMember> {
    const memberKey: Key = [MEMBERS_BY_WS, workspaceId, userId];
    const existing = await this.#adapter.get<WorkspaceMember>(memberKey);
    const member: WorkspaceMember = {
      workspaceId,
      userId,
      role,
      createdAt: existing?.value.createdAt ?? Date.now(),
    };
    await this.#adapter.batch(
      [
        { type: "set", key: memberKey, value: member },
        {
          type: "set",
          key: [MEMBERS_BY_USER, userId, workspaceId],
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
  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const memberKey: Key = [MEMBERS_BY_WS, workspaceId, userId];
    const existing = await this.#adapter.get<WorkspaceMember>(memberKey);
    if (!existing) return false;
    await this.#adapter.batch(
      [
        { type: "delete", key: memberKey },
        { type: "delete", key: [MEMBERS_BY_USER, userId, workspaceId] },
      ],
      { checks: [{ key: memberKey, versionstamp: existing.versionstamp }] },
    );
    return true;
  }

  /** List all members of a workspace. */
  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const { entries } = await this.#adapter.list<WorkspaceMember>([
      MEMBERS_BY_WS,
      workspaceId,
    ]);
    return entries
      .map((e) => e.value)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Get a specific membership, or undefined if the user is not a member. */
  async getMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember | undefined> {
    return (
      await this.#adapter.get<WorkspaceMember>([
        MEMBERS_BY_WS,
        workspaceId,
        userId,
      ])
    )?.value;
  }

  /**
   * Whether `userId` can access `workspaceId`, optionally requiring a role.
   * `owner` satisfies an `editor` requirement (owner >= editor).
   */
  async hasAccess(
    workspaceId: string,
    userId: string,
    role?: Role,
  ): Promise<boolean> {
    const membership = await this.getMembership(workspaceId, userId);
    if (!membership) return false;
    if (!role) return true;
    if (role === "editor") return true; // any member can edit
    return membership.role === "owner"; // role === "owner"
  }
}
