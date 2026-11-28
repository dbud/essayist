import { computed } from "@preact/signals";

import { boot } from "#/client/boot.tsx";
import { setupUrlSync } from "#/client/urlSync.ts";
import { editorPath, parseEditorPath } from "#/models/editorPath.ts";
import { workspaceIdOf, workspaceParam } from "#/models/workspaceParam.ts";
import type { EditorData } from "#/pages/editor/data.ts";
import createModels, { EditorModelsProvider } from "#/pages/editor/models.ts";
import Page from "#/pages/editor/page.tsx";

import { setupSelectionPersist, setupUnloadGuard } from "./editor/persist.ts";

void boot<EditorData>(({ data, preferences, state }) => {
  const models = createModels(data, state.user);
  const { selected, workspaces, fileTrees, fileVersions, fileContents } = models;

  setupSelectionPersist(selected);
  setupUnloadGuard(fileContents, preferences.autoSave);

  // the URL path names the workspace by its name and the start of its id, then the file by its
  // path; the query names the version by its seq, left out for the latest
  setupUrlSync(
    computed(() => {
      const selection = selected.value;
      const workspace = workspaces.current.value;
      const versions = fileVersions.current.value;
      const version = versions?.byId(selection?.versionId ?? null) ?? null;
      const latest = versions?.versions.value.at(-1) ?? null;
      return {
        path: editorPath(
          workspace === undefined ? null : workspaceParam(workspace.id, workspace.name),
          fileTrees.current.value?.pathOf(selection?.fileId ?? null) ?? null,
        ),
        query: { version: version && version.id !== latest?.id ? String(version.seq) : null },
      };
    }),
    (url) => {
      const { ws, path } = parseEditorPath(url.pathname);
      const ids = workspaces.list.peek().map(({ workspace }) => workspace.id);
      const wsId = workspaceIdOf(ws, ids);
      if (wsId !== null) workspaces.select(wsId);
      const tree = fileTrees.current.peek();
      if (tree === null) return;
      tree.select(tree.fileIdAt(path));
      // the file is selected first, so its versions are the current ones
      const seq = url.searchParams.get("version");
      const version = seq === null ? null : fileVersions.current.peek()?.bySeq(Number(seq));
      if (version) tree.selectVersion(version.id);
    },
  );

  return (
    <EditorModelsProvider value={models}>
      <Page />
    </EditorModelsProvider>
  );
});
