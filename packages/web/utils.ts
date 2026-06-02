import { createDefine } from "fresh";
import type { AgentClient } from "@essayist/core";

export interface State {
  agent: AgentClient;
}

export const define = createDefine<State>();
