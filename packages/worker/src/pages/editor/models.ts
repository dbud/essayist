import { CategoriesModel } from "#/models/categories.ts";
import { FileContentsModel } from "#/models/fileContents.ts";
import { FileMarksByPathModel } from "#/models/fileMarksByPath.ts";
import { createFileSelection } from "#/models/fileSelection.ts";
import { FileTreesModel } from "#/models/fileTrees.ts";
import { FileVersionsByPathModel } from "#/models/fileVersionsByPath.ts";
import { createModelContext } from "#/models/utils/context.ts";
import { WorkspacesModel } from "#/models/workspaces.ts";
import type { EditorData } from "./data";

export default function createModels(data: EditorData) {
  const workspaces = new WorkspacesModel(data.workspaces);
  const fileTrees = new FileTreesModel(workspaces.selectedId, data.fileTrees);
  const selected = createFileSelection(workspaces, fileTrees);
  const fileContents = new FileContentsModel(selected, data.fileView?.content);
  const fileVersions = new FileVersionsByPathModel(
    selected,
    data.fileView?.versions,
  );
  const marks = new FileMarksByPathModel(selected, data.fileView?.marks);
  const categories = new CategoriesModel(data.categories);
  return {
    workspaces,
    fileTrees,
    selected,
    fileContents,
    fileVersions,
    marks,
    categories,
  };
}

export type EditorModels = ReturnType<typeof createModels>;

export const { Provider: EditorModelsProvider, use: useEditorModels } =
  createModelContext<EditorModels>("EditorModels");
