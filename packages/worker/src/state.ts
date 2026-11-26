import type { User } from "@essayist/core";

import { createModelContext } from "#/models/utils/context.ts";

export type UserData = typeof User.json.Encoded;

export interface AppState {
  readonly user?: UserData;
  readonly sessionId?: string;
}

export const { Provider: AppStateProvider, use: useAppState } =
  createModelContext<AppState>("AppState");
