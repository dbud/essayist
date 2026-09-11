import { type FileEntry, VirtualFileSystem } from "@essayist/core";
import { treeNs } from "@/signals/fileTree.ts";
import { registerLoader } from "@/signals/models.server.ts";
import { adapter } from "@/store.ts";

export function fileTreeLoader(workspaceId: string): Promise<FileEntry[]> {
  return new VirtualFileSystem(adapter, workspaceId).list();
}

registerLoader(treeNs, fileTreeLoader);
