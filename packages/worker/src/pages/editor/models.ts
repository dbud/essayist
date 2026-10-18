import { createModelContext } from "#/models/context.ts";
import { FileTreesModel } from "#/models/fileTrees.ts";
import { WorkspacesModel } from "#/models/workspaces.ts";
import type { EditorData } from "./data";

export default function createModels(data: EditorData) {
  const workspaces = new WorkspacesModel(data.workspaces);
  const fileTrees = new FileTreesModel(workspaces.selectedId, data.fileTrees);
  return { workspaces, fileTrees };
}

export type EditorModels = ReturnType<typeof createModels>;

export const { Provider: EditorModelsProvider, use: useEditorModels } =
  createModelContext<EditorModels>("EditorModels");
