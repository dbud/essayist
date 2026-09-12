import { effect } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { getWorkspaces } from "@/signals/workspace.ts";

/**
 * Keeps the URL query at ?ws=<workspaceId>&file=<path>, matching the
 * selected workspace and file. Changes the user makes push a new history
 * entry; changes that arrive with loaded data update the current entry
 * instead. Back and forward re-apply the URL's workspace and file to the
 * app. These are the only query params the page manages; any other params
 * in the URL are dropped on the next update.
 */

const MARKER = "essayist";

function selectionUrl(wsId: string, file: string | null): string {
  const params = new URLSearchParams({ ws: wsId });
  if (file) params.set("file", file);
  return `${location.pathname}?${params.toString()}`;
}

if (IS_BROWSER) {
  effect(() => {
    const workspaces = getWorkspaces();
    const wsId = workspaces.selectedId.value;
    if (!wsId) return;

    const tree = getFileTreeFor(wsId);
    const file = tree.selectedPath.value;
    const url = selectionUrl(wsId, file);

    const current = new URLSearchParams(location.search);
    const locationWs = current.get("ws");
    const locationFile = current.get("file");

    // Converged: the current query already describes this selection.
    if (locationWs === wsId && locationFile === (file ?? null)) {
      return;
    }

    const knownWs =
      locationWs !== null &&
      workspaces.list.value.some((w) => w.id === locationWs);
    const knownFile =
      locationFile !== null &&
      tree.files.value.some((f) => f.path === locationFile);

    // Workspace navigation: the URL pins a different live workspace.
    if (knownWs && locationWs !== wsId) {
      history.pushState(MARKER, "", url);
      return;
    }

    // File navigation: the URL pins a different existing file.
    if (knownWs && locationFile !== null && knownFile) {
      history.pushState(MARKER, "", url);
      return;
    }

    // Blank or stale: fill or rewrite in place.
    history.replaceState(MARKER, "", url);
  });

  addEventListener("popstate", (e: PopStateEvent) => {
    // Fresh-managed entries fall back to a full reload there instead.
    if (e.state !== MARKER) return;
    const params = new URLSearchParams(location.search);
    const wsId = params.get("ws");
    if (!wsId) return; // our entries always carry a workspace
    getWorkspaces().select(wsId);
    getFileTreeFor(wsId).select(params.get("file"));
  });
}
