import type { PersistenceAdapter } from "@/persistence/mod.ts";

// Key layout:
//   ["user_state", userId, "workspace"]      -> { wsId }
//   ["user_state", userId, "file", wsId]     -> { path }
const USER_STATE = "user_state";
const WORKSPACE = "workspace";
const FILE = "file";

/** Persisted record of the user's selected workspace. */
interface SelectedWorkspace {
  wsId: string;
}

/** Persisted record of the user's selected file within one workspace. */
interface SelectedFile {
  path: string;
}

/**
 * Per-user server-side state: the user's most recent selection and, over
 * time, other cross-device preferences.
 */
export class UserStateStore {
  #adapter: PersistenceAdapter;

  constructor(adapter: PersistenceAdapter) {
    this.#adapter = adapter;
  }

  // -- selection --

  async getSelectedWorkspace(userId: string): Promise<string | undefined> {
    const entry = await this.#adapter.get<SelectedWorkspace>([
      USER_STATE,
      userId,
      WORKSPACE,
    ]);
    return entry?.value.wsId;
  }

  async setSelectedWorkspace(userId: string, wsId: string): Promise<void> {
    await this.#adapter.set([USER_STATE, userId, WORKSPACE], {
      wsId,
    } satisfies SelectedWorkspace);
  }

  async getSelectedFile(
    userId: string,
    wsId: string,
  ): Promise<string | undefined> {
    const entry = await this.#adapter.get<SelectedFile>([
      USER_STATE,
      userId,
      FILE,
      wsId,
    ]);
    return entry?.value.path;
  }

  async setSelectedFile(
    userId: string,
    wsId: string,
    path: string,
  ): Promise<void> {
    await this.#adapter.set([USER_STATE, userId, FILE, wsId], {
      path,
    } satisfies SelectedFile);
  }
}
