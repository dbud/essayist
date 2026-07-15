import type { Agent, User, VirtualFileSystem } from "@essayist/core";
import { createDefine } from "fresh";

export interface State {
  agent: Agent;
  user: User;
  vfs: VirtualFileSystem;
  workspaceId: string;
}

export const define = createDefine<State>();
