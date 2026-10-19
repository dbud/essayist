import { computed } from "@preact/signals";
import { CategoriesModel } from "#/models/categories.ts";
import { FileContentsModel } from "#/models/fileContents.ts";
import { FileTreesModel } from "#/models/fileTrees.ts";
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
  const categories = new CategoriesModel(data.categories);
  return {
    workspaces,
    fileTrees,
    fileContents,
    categories,
  };
}

export type EditorModels = ReturnType<typeof createModels>;

export const { Provider: EditorModelsProvider, use: useEditorModels } =
  createModelContext<EditorModels>("EditorModels");
