import { VirtualFileSystem } from "@essayist/core";
import type { FileKey } from "@/signals/file.ts";
import { type MarksData, marksNs } from "@/signals/marks.ts";
import { registerLoader } from "@/signals/models.server.ts";
import { adapter } from "@/store.ts";

export async function marksLoader({
  workspaceId,
  path,
}: FileKey): Promise<MarksData> {
  const vfs = new VirtualFileSystem(adapter, workspaceId);
  const checkpoint = await vfs.read(path);
  const marks = checkpoint.version_id
    ? await vfs.getMarks(path, checkpoint.version_id)
    : [];
  return {
    marks,
    versionId: checkpoint.version_id,
    content: checkpoint.content,
  };
}

registerLoader(marksNs, marksLoader);
