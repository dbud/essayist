import { computed } from "@preact/signals";
import { CategoriesModel } from "#/models/categories.ts";
import { FileContentsModel } from "#/models/fileContents.ts";
import { FileMarksByPathModel } from "#/models/fileMarksByPath.ts";
import { FileTreesModel } from "#/models/fileTrees.ts";
import { FileVersionsByPathModel } from "#/models/fileVersionsByPath.ts";
import { createModelContext } from "#/models/utils/context.ts";
import { WorkspacesModel } from "#/models/workspaces.ts";
import type { EditorData } from "./data";

export default function createModels(data: EditorData) {
  const workspaces = new WorkspacesModel(data.workspaces);
  const fileTrees = new FileTreesModel(workspaces.selectedId, data.fileTrees);
  const selectedPath = computed(
    () => fileTrees.current.value?.selectedPath.value ?? null,
  );
  const fileContents = new FileContentsModel(
    workspaces.selectedId,
    selectedPath,
    data.fileContents,
  );
  const fileVersions = new FileVersionsByPathModel(
    workspaces.selectedId,
    selectedPath,
    data.fileVersions,
  );
  // Marks are re-anchored onto the version of the shown content, so the
  // mark version is the content's version.
  const selectedVersionId = computed(
    () => fileContents.current.value?.version.value?.version_id ?? null,
  );
  const marks = new FileMarksByPathModel(
    workspaces.selectedId,
    selectedPath,
    selectedVersionId,
    data.fileMarks,
  );
  const categories = new CategoriesModel(data.categories);
  return {
    workspaces,
    fileTrees,
    fileContents,
    fileVersions,
    marks,
    categories,
  };
}

export type EditorModels = ReturnType<typeof createModels>;

export const { Provider: EditorModelsProvider, use: useEditorModels } =
  createModelContext<EditorModels>("EditorModels");
