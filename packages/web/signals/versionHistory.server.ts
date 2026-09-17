import { VirtualFileSystem } from "@essayist/core";
import type { FileKey } from "@/signals/file.ts";
import { registerLoader } from "@/signals/models.server.ts";
import {
  type VersionHistoryData,
  versionHistoryNs,
} from "@/signals/versionHistory.ts";
import { adapter } from "@/store.ts";

export async function versionHistoryLoader({
  wsId,
  path,
}: FileKey): Promise<VersionHistoryData> {
  const vfs = new VirtualFileSystem(adapter, wsId);
  return { versions: await vfs.getHistory(path) };
}

registerLoader(versionHistoryNs, versionHistoryLoader);
