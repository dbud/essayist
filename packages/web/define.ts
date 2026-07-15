import type { Agent, User } from "@essayist/core";
import { createDefine } from "fresh";

export interface State {
  agent: Agent;
  user: User;
}

export const define = createDefine<State>();
