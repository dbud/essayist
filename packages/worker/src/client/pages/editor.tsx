import { boot } from "#/client/boot.tsx";
import type { EditorData } from "#/pages/editor/data.ts";
import createModels, { EditorModelsProvider } from "#/pages/editor/models.ts";
import Page from "#/pages/editor/page.tsx";
import { setupSelectionPersist } from "./editor/persist.ts";

void boot((data: EditorData) => {
  const models = createModels(data);
  setupSelectionPersist(models);

  return (
    <EditorModelsProvider value={models}>
      <Page />
    </EditorModelsProvider>
  );
});
