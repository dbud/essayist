import type { PersistenceAdapter } from "@/persistence/mod.ts";

// Key layout:
//   ["user_state", userId, "workspace"]      -> { workspaceId }
//   ["user_state", userId, "file", wsId]     -> { path }
const USER_STATE = "user_state";
const WORKSPACE = "workspace";
const FILE = "file";

/** Persisted record of the user's selected workspace. */
interface SelectedWorkspace {
  workspaceId: string;
}

/** Persisted record of the user's selected file within one workspace. */
interface SelectedFile {
  path: string;
}

/**
 * Per-user server-side state: the user's most recent selection and, over
 * time, other cross-device preferences. The selection is persisted so a
 * session can restore it; a URL-specified selection overrides it.
 *
 * Writes are last-write-wins single-key sets; there are no cross-entity
 * invariants or concurrency checks.
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
    return entry?.value.workspaceId;
  }

  async setSelectedWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.#adapter.set([USER_STATE, userId, WORKSPACE], {
      workspaceId,
    } satisfies SelectedWorkspace);
  }

  async getSelectedFile(
    userId: string,
    workspaceId: string,
  ): Promise<string | undefined> {
    const entry = await this.#adapter.get<SelectedFile>([
      USER_STATE,
      userId,
      FILE,
      workspaceId,
    ]);
    return entry?.value.path;
  }

  async setSelectedFile(
    userId: string,
    workspaceId: string,
    path: string,
  ): Promise<void> {
    await this.#adapter.set([USER_STATE, userId, FILE, workspaceId], {
      path,
    } satisfies SelectedFile);
  }
}
