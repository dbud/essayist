import type { Agent } from "@essayist/core";
import { createDefine } from "fresh";

export interface State {
  agent: Agent;
}

export const define = createDefine<State>();
