import type { FileKey } from "@/signals/file.ts";
import { registerLoader } from "@/signals/models.server.ts";
import {
  type VersionHistoryData,
  versionHistoryNs,
} from "@/signals/versionHistory.ts";
import { runtime } from "@/store.ts";
import { vfsFor } from "@/vfs.ts";

export async function versionHistoryLoader({
  wsId,
  path,
}: FileKey): Promise<VersionHistoryData> {
  const vfs = vfsFor(runtime, wsId);
  return { versions: await vfs.getHistory(path) };
}

registerLoader(versionHistoryNs, versionHistoryLoader);
