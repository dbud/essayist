import type { FileKey } from "@/signals/file.ts";
import { type FileData, fileNs } from "@/signals/file.ts";
import { registerLoader } from "@/signals/models.server.ts";
import { runtime } from "@/store.ts";
import { vfsFor } from "@/vfs.ts";

export async function fileLoader({
  wsId,
  path,
  versionId,
}: FileKey): Promise<FileData> {
  const vfs = vfsFor(runtime, wsId);
  const checkpoint = await vfs.read(path, { versionId });
  if (versionId && checkpoint.version_id === "") {
    throw new Error(`Version not found: ${versionId}`);
  }
  return {
    checkpoint,
    draft: versionId ? null : await vfs.readDraft(path),
  };
}

registerLoader(fileNs, fileLoader);
