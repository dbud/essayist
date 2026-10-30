import { computed } from "@preact/signals";

import { boot } from "#/client/boot.tsx";
import { setupUrlQuerySync } from "#/client/urlQuery.ts";
import type { EditorData } from "#/pages/editor/data.ts";
import createModels, { EditorModelsProvider } from "#/pages/editor/models.ts";
import Page from "#/pages/editor/page.tsx";
import { autoSave } from "#/signals/preferences.ts";

import { setupSelectionPersist, setupUnloadGuard } from "./editor/persist.ts";

void boot((data: EditorData) => {
  const models = createModels(data);
  const { selected, workspaces, fileTrees, fileContents } = models;

  setupSelectionPersist(selected);
  setupUnloadGuard(fileContents, autoSave);

  setupUrlQuerySync(
    computed(() => ({
      wsId: selected.value?.wsId ?? null,
      path: selected.value?.path ?? null,
      versionId: selected.value?.versionId ?? null,
    })),
    (params) => {
      const wsId = params.get("wsId");
      if (wsId) workspaces.select(wsId);
      fileTrees.current.value?.select(params.get("path"), params.get("versionId"));
    },
  );

  return (
    <EditorModelsProvider value={models}>
      <Page />
    </EditorModelsProvider>
  );
});
