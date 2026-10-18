import type { User } from "@essayist/core";
import { createModelContext } from "#/models/utils/context.ts";

export interface AppState {
  readonly user?: User;
  readonly sessionId?: string;
}

export const { Provider: AppStateProvider, use: useAppState } =
  createModelContext<AppState>("AppState");
