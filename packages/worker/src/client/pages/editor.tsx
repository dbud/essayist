import { computed } from "@preact/signals";
import { boot } from "#/client/boot.tsx";
import { setupUrlQuerySync } from "#/client/urlQuery.ts";
import type { EditorData } from "#/pages/editor/data.ts";
import createModels, { EditorModelsProvider } from "#/pages/editor/models.ts";
import Page from "#/pages/editor/page.tsx";
import { setupSelectionPersist } from "./editor/persist.ts";

void boot((data: EditorData) => {
  const models = createModels(data);
  setupSelectionPersist(models);

  setupUrlQuerySync(
    computed(() => ({
      wsId: models.workspaces.selectedId.value,
      path: models.fileTrees.current.value?.selectedPath.value,
      versionId: models.fileTrees.current.value?.selectedVersionId.value,
    })),
    (params) => {
      const wsId = params.get("wsId");
      if (wsId) models.workspaces.select(wsId);
      models.fileTrees.current.value?.select(
        params.get("path"),
        params.get("versionId"),
      );
    },
  );

  return (
    <EditorModelsProvider value={models}>
      <Page />
    </EditorModelsProvider>
  );
});
