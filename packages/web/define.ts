import { createDefine } from "fresh";
import type { Agent } from "@essayist/core";

export interface State {
  agent: Agent;
}

export const define = createDefine<State>();
