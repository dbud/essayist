import type { User, VirtualFileSystem } from "@essayist/core";
import { createDefine } from "fresh";

export interface State {
  user: User;
  vfs: VirtualFileSystem;
  wsId: string;
  sessionId?: string;
}

export const define = createDefine<State>();
