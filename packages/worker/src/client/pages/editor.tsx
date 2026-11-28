import { computed } from "@preact/signals";

import { boot } from "#/client/boot.tsx";
import { setupUrlSync } from "#/client/urlSync.ts";
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

  // the URL names the workspace by its name and the start of its id, the file by its path, and the
  // version by its seq, left out for the latest
  setupUrlSync(
    computed(() => {
      const selection = selected.value;
      const workspace = workspaces.current.value;
      const versions = fileVersions.current.value;
      const version = versions?.byId(selection?.versionId ?? null) ?? null;
      const latest = versions?.versions.value.at(-1) ?? null;
      return {
        query: {
          ws: workspace === undefined ? null : workspaceParam(workspace.id, workspace.name),
          path: fileTrees.current.value?.pathOf(selection?.fileId ?? null) ?? null,
          version: version && version.id !== latest?.id ? String(version.seq) : null,
        },
      };
    }),
    ({ searchParams: params }) => {
      const ids = workspaces.list.peek().map(({ workspace }) => workspace.id);
      const wsId = workspaceIdOf(params.get("ws"), ids);
      if (wsId !== null) workspaces.select(wsId);
      const tree = fileTrees.current.peek();
      if (tree === null) return;
      tree.select(tree.fileIdAt(params.get("path")));
      // the file is selected first, so its versions are the current ones
      const seq = params.get("version");
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
