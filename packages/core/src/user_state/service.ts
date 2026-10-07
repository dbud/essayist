/**
 * Per-user server-side state as an Effect service: the user's most recent
 * selection and, over time, other cross-device preferences.
 */

import { Context, Effect, Layer } from "effect";
import {
  type ConcurrentModificationError,
  Persistence,
  type PersistenceError,
} from "@/persistence/mod.ts";

// Key layout:
//   ["user_state", userId, "workspace"]      -> { wsId }
//   ["user_state", userId, "file", wsId]     -> { path }
const USER_STATE = "user_state";
const WORKSPACE = "workspace";
const FILE = "file";

/** Persisted record of the selected workspace. */
interface SelectedWorkspace {
  wsId: string;
}

/** Persisted record of the selected file within a workspace. */
interface SelectedFile {
  path: string;
}

export class UserState extends Context.Service<
  UserState,
  {
    /** The user's most recent workspace selection. */
    getSelectedWorkspace(
      userId: string,
    ): Effect.Effect<string | undefined, PersistenceError>;
    /** Pin the user's most recent workspace selection. */
    setSelectedWorkspace(
      userId: string,
      wsId: string,
    ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
    /** The user's most recent file selection within a workspace. */
    getSelectedFile(
      userId: string,
      wsId: string,
    ): Effect.Effect<string | undefined, PersistenceError>;
    /** Pin the user's most recent file selection within a workspace. */
    setSelectedFile(
      userId: string,
      wsId: string,
      path: string,
    ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  }
>()("@essayist/core/user_state/UserState") {
  /** Requires the {@linkcode Persistence} service; compose with layerKv or
   * layerMemory at the composition root. */
  static readonly layerNoDeps: Layer.Layer<UserState, never, Persistence> =
    Layer.effect(
      UserState,
      Effect.gen(function* () {
        const persistence = yield* Persistence;

        const getSelectedWorkspace = (userId: string) =>
          persistence
            .get<SelectedWorkspace>([USER_STATE, userId, WORKSPACE])
            .pipe(Effect.map((entry) => entry?.value.wsId));

        const setSelectedWorkspace = (userId: string, wsId: string) =>
          persistence.set([USER_STATE, userId, WORKSPACE], {
            wsId,
          } satisfies SelectedWorkspace);

        const getSelectedFile = (userId: string, wsId: string) =>
          persistence
            .get<SelectedFile>([USER_STATE, userId, FILE, wsId])
            .pipe(Effect.map((entry) => entry?.value.path));

        const setSelectedFile = (userId: string, wsId: string, path: string) =>
          persistence.set([USER_STATE, userId, FILE, wsId], {
            path,
          } satisfies SelectedFile);

        return UserState.of({
          getSelectedWorkspace,
          setSelectedWorkspace,
          getSelectedFile,
          setSelectedFile,
        });
      }),
    );
}
