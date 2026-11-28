import { computed } from "@preact/signals";

import { boot } from "#/client/boot.tsx";
import { setupUrlQuerySync } from "#/client/urlQuery.ts";
import type { EditorData } from "#/pages/editor/data.ts";
import createModels, { EditorModelsProvider } from "#/pages/editor/models.ts";
import Page from "#/pages/editor/page.tsx";

import { setupSelectionPersist, setupUnloadGuard } from "./editor/persist.ts";

void boot<EditorData>(({ data, preferences, state }) => {
  const models = createModels(data, state.user);
  const { selected, workspaces, fileTrees, fileContents } = models;

  setupSelectionPersist(selected);
  setupUnloadGuard(fileContents, preferences.autoSave);

  // the URL names the file by its path, which the tree turns into the id
  setupUrlQuerySync(
    computed(() => ({
      wsId: selected.value?.wsId ?? null,
      path: fileTrees.current.value?.pathOf(selected.value?.fileId ?? null) ?? null,
      versionId: selected.value?.versionId ?? null,
    })),
    (params) => {
      const wsId = params.get("wsId");
      if (wsId) workspaces.select(wsId);
      const tree = fileTrees.current.value;
      tree?.select(tree.fileIdAt(params.get("path")), params.get("versionId"));
    },
  );

  return (
    <EditorModelsProvider value={models}>
      <Page />
    </EditorModelsProvider>
  );
});
