import { computed } from "@preact/signals";

import { boot } from "#/client/boot.tsx";
import { setupUrlQuerySync } from "#/client/urlQuery.ts";
import type { EditorData } from "#/pages/editor/data.ts";
import createModels, { EditorModelsProvider } from "#/pages/editor/models.ts";
import Page from "#/pages/editor/page.tsx";

import { setupSelectionPersist, setupUnloadGuard } from "./editor/persist.ts";

void boot<EditorData>(({ data, preferences, state }) => {
  const models = createModels(data, state.user);
  const { selected, workspaces, fileTrees, fileVersions, fileContents } = models;

  setupSelectionPersist(selected);
  setupUnloadGuard(fileContents, preferences.autoSave);

  // the URL names the file by its path and the version by its seq, left out for the latest
  setupUrlQuerySync(
    computed(() => {
      const selection = selected.value;
      const versions = fileVersions.current.value;
      const version = versions?.byId(selection?.versionId ?? null) ?? null;
      const latest = versions?.versions.value.at(-1) ?? null;
      return {
        ws: selection?.wsId ?? null,
        path: fileTrees.current.value?.pathOf(selection?.fileId ?? null) ?? null,
        version: version && version.id !== latest?.id ? String(version.seq) : null,
      };
    }),
    (params) => {
      const wsId = params.get("ws");
      if (wsId) workspaces.select(wsId);
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
