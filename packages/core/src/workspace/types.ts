import { Schema } from "effect";
import { Model } from "effect/schema";

/** Site-wide role. `admin` can access the admin area and manage config. */
export const USER_ROLES = ["admin", "writer"] as const;
export const UserRole = Schema.Literals(USER_ROLES);
export type UserRole = typeof UserRole.Type;

/** A user identity. */
export class User extends Model.Class<User>("User")({
  id: Model.GeneratedByApp(Schema.String),
  email: Schema.String,
  name: Model.FieldOption(Schema.String),
  picture: Model.FieldOption(Schema.String),
  role: UserRole,
  createdAt: Model.DateTimeInsert,
}) {}

/** Editable profile fields of a {@link User}, as a sign-in reports them. */
export interface UserProfile {
  name?: string;
  picture?: string;
}

/** Input for creating a user: the unique email plus optional profile fields. */
export interface UserInput extends UserProfile {
  email: string;
}

/**
 * Membership role within a workspace. `owner` >= `editor`: an owner can do everything an editor
 * can, plus manage members and delete the workspace.
 */
export const Role = Schema.Literals(["owner", "editor"]);
export type Role = typeof Role.Type;

/**
 * A named collection of files, shared with its members. Access comes from the member roles;
 * `createdBy` only records who created it. A deleted workspace keeps its record, memberships, and
 * data; `deletedAt` hides it from listings and access checks.
 */
export class Workspace extends Model.Class<Workspace>("Workspace")({
  id: Model.GeneratedByApp(Schema.String),
  name: Schema.String,
  createdBy: Schema.String,
  createdAt: Model.DateTimeInsert,
  deletedAt: Model.FieldOption(Schema.DateTimeUtcFromString),
  deletedBy: Model.FieldOption(Schema.String),
}) {}

/** The many-to-many share edge between a user and a workspace. */
export class WorkspaceMember extends Model.Class<WorkspaceMember>("WorkspaceMember")({
  wsId: Schema.String,
  userId: Schema.String,
  role: Role,
  createdAt: Model.DateTimeInsert,
}) {}

/** Creating a user with an email that is already in use. */
/** A user was looked up to be changed and does not exist. */
export class UserMissingError extends Schema.TaggedError<UserMissingError>()("UserMissingError", {
  userId: Schema.String,
}) {
  override get message() {
    return `No user ${this.userId}`;
  }
}

export class UserEmailTakenError extends Schema.TaggedError<UserEmailTakenError>()(
  "UserEmailTakenError",
  { email: Schema.String },
) {
  override get message() {
    return `User with email ${this.email} already exists`;
  }
}

/**
 * An operation would leave a workspace with no owner (removing or demoting the last owner).
 */
export class LastOwnerError extends Schema.TaggedError<LastOwnerError>()("LastOwnerError", {
  wsId: Schema.String,
}) {
  override get message() {
    return `Cannot remove the last owner of workspace ${this.wsId}`;
  }
}
