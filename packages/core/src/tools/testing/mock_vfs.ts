import type { VFS } from "@/vfs/types.ts";

export function createMockVFS(overrides?: Partial<VFS>): VFS {
  return { ...overrides } as VFS;
}
