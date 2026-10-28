import { Schema } from "effect";

/** A user identity. */
export interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  role?: UserRole;
  createdAt: number;
}

/** Editable profile fields shared by {@link User}. Used for create/update. */
export interface UserProfile {
  name?: string;
  picture?: string;
}

/** Site-wide role. `admin` can access the admin area and manage config. */
export const USER_ROLES = ["admin", "writer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Input for creating a user: the unique email plus optional profile fields. */
export interface UserInput extends UserProfile {
  email: string;
}

/**
 * Membership role within a workspace. `owner` >= `editor`: an owner can do
 * everything an editor can, plus manage members and delete the workspace.
 */
export type Role = "owner" | "editor";

/** A named collection of files owned by a user, shareable with others. */
export const Workspace = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  ownerId: Schema.String,
  createdAt: Schema.Number,
});
export type Workspace = Schema.Schema.Type<typeof Workspace>;

/** The many-to-many share edge between a user and a workspace. */
export interface WorkspaceMember {
  wsId: string;
  userId: string;
  role: Role;
  createdAt: number;
}

/** Creating a user with an email that is already in use. */
export class UserEmailTakenError extends Schema.TaggedError<UserEmailTakenError>()(
  "UserEmailTakenError",
  { email: Schema.String },
) {
  override get message() {
    return `User with email ${this.email} already exists`;
  }
}

/**
 * An operation would leave a workspace with no owner
 * (removing or demoting the last owner).
 */
export class LastOwnerError extends Schema.TaggedError<LastOwnerError>()("LastOwnerError", {
  wsId: Schema.String,
}) {
  override get message() {
    return `Cannot remove the last owner of workspace ${this.wsId}`;
  }
}
