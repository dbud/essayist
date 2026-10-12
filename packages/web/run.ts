import {
  type Files,
  type Marks,
  type Search,
  WorkspaceId,
} from "@essayist/core";
import { Effect } from "effect";
import type { Runtime } from "@/store.ts";

export type RunScoped = <A, E>(
  effect: Effect.Effect<A, E, Files | Marks | Search | WorkspaceId>,
) => Promise<A>;

/** Run one files/marks/search effect under a workspace scope, as a
 * promise for a route handler. */
export function runScoped(runtime: Runtime, wsId: string): RunScoped {
  return (effect) =>
    runtime.runPromise(Effect.provideService(effect, WorkspaceId, { wsId }));
}
