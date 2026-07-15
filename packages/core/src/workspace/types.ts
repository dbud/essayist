/** A user identity. */
export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: number;
}

/**
 * Membership role within a workspace. `owner` >= `editor`: an owner can do
 * everything an editor can, plus manage members and delete the workspace.
 */
export type Role = "owner" | "editor";

/** A named collection of files owned by a user, shareable with others. */
export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}

/** The many-to-many share edge between a user and a workspace. */
export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: Role;
  createdAt: number;
}

/** Thrown when creating a user with an email that is already in use. */
export class UserEmailTakenError extends Error {
  constructor(public readonly email: string) {
    super(`User with email ${email} already exists`);
  }
}

/**
 * Thrown when an operation would leave a workspace with no owner
 * (removing or demoting the last owner).
 */
export class LastOwnerError extends Error {
  constructor(public readonly workspaceId: string) {
    super(`Cannot remove the last owner of workspace ${workspaceId}`);
  }
}
