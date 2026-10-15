import type { User } from "@essayist/core";
import { createDefine } from "fresh";
import type { RunScoped } from "#/run.ts";

export interface State {
  user: User;
  run: RunScoped;
  wsId: string;
  sessionId?: string;
}

export const define = createDefine<State>();
