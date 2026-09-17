import { effect } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { getWorkspaces } from "@/signals/workspace.ts";
import { parseReplayParams, type ReplayParams } from "@/utils/reviewReplay.ts";

/**
 * Keeps the URL query at ?ws=<wsId>&file=<path>[&v=<versionId>], matching
 * the selected workspace, file, and viewed version. Changes the user makes
 * push a new history entry; changes that arrive with loaded data update
 * the current entry instead. Back and forward re-apply the URL's
 * workspace, file, and version to the app. Replay params (?replay, ?speed)
 * survive in-place rewrites and are dropped when the workspace or file
 * selection changes, since a replay belongs to one file's run; a viewed
 * version also belongs to one file and is dropped on file navigation.
 * These are the only query params the page manages; any other params in
 * the URL are dropped on the next update.
 */

const MARKER = "essayist";

function selectionUrl({
  wsId,
  file,
  version,
  replay,
}: {
  wsId: string;
  file: string | null;
  version?: string | null;
  replay?: ReplayParams | null;
}): string {
  const params = new URLSearchParams({ ws: wsId });
  if (file) params.set("file", file);
  if (version) params.set("v", version);
  if (replay) {
    params.set("replay", replay.runId);
    if (replay.speed !== 1) params.set("speed", String(replay.speed));
  }
  return `${location.pathname}?${params.toString()}`;
}

if (IS_BROWSER) {
  effect(() => {
    const workspaces = getWorkspaces();
    const wsId = workspaces.selectedId.value;
    if (!wsId) return;

    const tree = getFileTreeFor(wsId);
    const file = tree.selectedPath.value;
    const version = tree.selectedVersionId.value;

    const current = new URLSearchParams(location.search);
    const locationWs = current.get("ws");
    const locationFile = current.get("file");
    const locationVersion = current.get("v");

    // Already in sync: the query matches this selection.
    if (
      locationWs === wsId &&
      locationFile === (file ?? null) &&
      locationVersion === (version ?? null)
    ) {
      return;
    }

    const replay = parseReplayParams(location.search);

    const knownWs =
      locationWs !== null &&
      workspaces.list.value.some((w) => w.id === locationWs);
    const knownFile =
      locationFile !== null &&
      tree.files.value.some((f) => f.path === locationFile);

    // Workspace navigation: the URL pins a different live workspace.
    if (knownWs && locationWs !== wsId) {
      history.pushState(MARKER, "", selectionUrl({ wsId, file }));
      return;
    }

    // File navigation: the URL pins a different existing file. The
    // viewed version belongs to the old file and is dropped.
    if (knownWs && locationFile !== null && knownFile) {
      history.pushState(MARKER, "", selectionUrl({ wsId, file }));
      return;
    }

    // Version navigation: the same file is pinned, with a different or
    // missing version in the query.
    if (knownWs && knownFile && locationVersion !== (version ?? null)) {
      history.pushState(MARKER, "", selectionUrl({ wsId, file, version }));
      return;
    }

    // Blank or stale: fill or rewrite in place, preserving replay params.
    history.replaceState(
      MARKER,
      "",
      selectionUrl({ wsId, file, version, replay }),
    );
  });

  addEventListener("popstate", (e: PopStateEvent) => {
    // Fresh-managed entries fall back to a full reload there instead.
    if (e.state !== MARKER) return;
    const params = new URLSearchParams(location.search);
    const wsId = params.get("ws");
    if (!wsId) return; // our entries always carry a workspace
    getWorkspaces().select(wsId);
    const tree = getFileTreeFor(wsId);
    tree.select(params.get("file"));
    tree.selectVersion(params.get("v"));
  });
}
