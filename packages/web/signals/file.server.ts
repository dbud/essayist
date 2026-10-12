import { Files } from "@essayist/core";
import { runScoped } from "@/run.ts";
import type { FileKey } from "@/signals/file.ts";
import { type FileData, fileNs } from "@/signals/file.ts";
import { registerLoader } from "@/signals/models.server.ts";
import { runtime } from "@/store.ts";

export async function fileLoader({
  wsId,
  path,
  versionId,
}: FileKey): Promise<FileData> {
  const run = runScoped(runtime, wsId);
  const checkpoint = await run(
    Files.use((files) => files.read(path, { versionId })),
  );
  if (versionId && checkpoint.version_id === "") {
    throw new Error(`Version not found: ${versionId}`);
  }
  return {
    checkpoint,
    draft: versionId ? null : await run(Files.use((f) => f.readDraft(path))),
  };
}

registerLoader(fileNs, fileLoader);
