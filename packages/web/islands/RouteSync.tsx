import { effect } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { getOpenedFilesFor } from "@/signals/openedFiles.ts";
import { workspaces } from "@/signals/workspace.ts";

/**
 * Drives client-side signals from route params so
 * `/w/:wsId/f/:fileId` opens the matching workspace + file. Re-asserts when
 * the workspaces list settles, since `workspaces.load()` can override the
 * current workspace id once on bootstrap.
 */
export default function RouteSync({
  wsId,
  fileId,
}: {
  wsId: string;
  fileId: string;
}) {
  useEffect(() => {
    const apply = () => {
      workspaces.select(wsId);
      getOpenedFilesFor(wsId).open(fileId);
    };

    apply();

    // Re-assert after the workspaces list loads. `list` only changes once
    // (on load), and we don't track currentWorkspaceId here, so no cycle.
    const dispose = effect(() => {
      workspaces.list.value;
      apply();
    });
    return () => dispose();
  }, [wsId, fileId]);

  return null;
}
