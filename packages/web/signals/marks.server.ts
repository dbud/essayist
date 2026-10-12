import type { FileKey } from "@/signals/file.ts";
import { type MarksData, marksNs } from "@/signals/marks.ts";
import { registerLoader } from "@/signals/models.server.ts";
import { runtime } from "@/store.ts";
import { vfsFor } from "@/vfs.ts";

export async function marksLoader({
  wsId,
  path,
  versionId,
}: FileKey): Promise<MarksData> {
  const vfs = vfsFor(runtime, wsId);
  const checkpoint = await vfs.read(path, { versionId });
  if (versionId && checkpoint.version_id === "") {
    throw new Error(`Version not found: ${versionId}`);
  }
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
