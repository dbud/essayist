import type { User, VFS } from "@essayist/core";
import { createDefine } from "fresh";

export interface State {
  user: User;
  vfs: VFS;
  wsId: string;
  sessionId?: string;
}

export const define = createDefine<State>();
