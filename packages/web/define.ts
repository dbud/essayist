import type { ConfigStore, User, VirtualFileSystem } from "@essayist/core";
import { createDefine } from "fresh";

export interface State {
  config: ConfigStore;
  user: User;
  vfs: VirtualFileSystem;
  workspaceId: string;
  sessionId?: string;
}

export const define = createDefine<State>();
