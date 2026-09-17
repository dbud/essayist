import { VirtualFileSystem } from "@essayist/core";
import type { FileKey } from "@/signals/file.ts";
import { type FileData, fileNs } from "@/signals/file.ts";
import { registerLoader } from "@/signals/models.server.ts";
import { adapter } from "@/store.ts";

export async function fileLoader({
  workspaceId,
  path,
  versionId,
}: FileKey): Promise<FileData> {
  const vfs = new VirtualFileSystem(adapter, workspaceId);
  return {
    checkpoint: await vfs.read(path, { versionId }),
    draft: versionId ? null : await vfs.readDraft(path),
  };
}

registerLoader(fileNs, fileLoader);
