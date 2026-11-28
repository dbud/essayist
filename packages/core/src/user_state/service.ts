/** What a user last had open, kept per member of a workspace so it follows them across devices. */

import { Context, type Effect, type Option } from "effect";

export interface Interface {
  /** The workspace the user opened last, skipping the ones they left or that were deleted. */
  getSelectedWorkspace(userId: string): Effect.Effect<Option.Option<string>>;
  /** Record that a member opened a workspace. */
  setSelectedWorkspace(userId: string, wsId: string): Effect.Effect<void>;
  /** The id of the file the member last selected in a workspace, while the file exists. */
  getSelectedFile(userId: string, wsId: string): Effect.Effect<Option.Option<string>>;
  /** Record the file a member selected; an id with no file in the workspace selects nothing. */
  setSelectedFile(userId: string, wsId: string, fileId: string): Effect.Effect<void>;
}

export class UserState extends Context.Service<UserState, Interface>()(
  "@essayist/core/user_state/UserState",
) {}
