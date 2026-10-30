import { Files } from "@essayist/core";
import { runScoped } from "#/run.ts";
import type { FileKey } from "#/signals/file.ts";
import { type MarksData, marksNs } from "#/signals/marks.ts";
import { registerLoader } from "#/signals/models.server.ts";
import { runtime } from "#/store.ts";

export async function marksLoader({
  wsId,
  path,
  versionId,
}: FileKey): Promise<MarksData> {
  const run = runScoped(runtime, wsId);
  const checkpoint = await run(
    Files.use((files) => files.read(path, versionId)),
  );
  const marks = await run(
    Files.use((files) => files.getMarks(path, checkpoint.version_id)),
  );
  return {
    marks,
    versionId: checkpoint.version_id,
    content: checkpoint.content,
  };
}

registerLoader(marksNs, marksLoader);
