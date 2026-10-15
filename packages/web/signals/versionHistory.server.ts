import { Files } from "@essayist/core";
import { runScoped } from "#/run.ts";
import type { FileKey } from "#/signals/file.ts";
import { registerLoader } from "#/signals/models.server.ts";
import {
  type VersionHistoryData,
  versionHistoryNs,
} from "#/signals/versionHistory.ts";
import { runtime } from "#/store.ts";

export async function versionHistoryLoader({
  wsId,
  path,
}: FileKey): Promise<VersionHistoryData> {
  return {
    versions: await runScoped(
      runtime,
      wsId,
    )(Files.use((files) => files.getHistory(path))),
  };
}

registerLoader(versionHistoryNs, versionHistoryLoader);
