import { InMemoryAdapter } from "../../persistence/mod.ts";
import { VirtualFileSystem } from "../vfs.ts";

export async function createVFS(
  files?: Map<string, string>,
  wsId = "default",
): Promise<VirtualFileSystem> {
  const adapter = new InMemoryAdapter();
  const vfs = new VirtualFileSystem(adapter, wsId);
  if (files) {
    for (const [path, content] of files) {
      await vfs.write(path, content);
    }
  }
  return vfs;
}

export async function createFile(
  path: string,
  content: string,
): Promise<{ vfs: VirtualFileSystem; versionId: string }> {
  const vfs = await createVFS(new Map([[path, content]]));
  const file = await vfs.read(path);
  return { vfs, versionId: file.version_id };
}
