import { createModelContext } from "#/models/context.ts";
import { FileTreeModel } from "#/models/fileTree.ts";
import { WorkspacesModel } from "#/models/workspaces.ts";
import type { EditorData } from "./data";

export default function createModels(data: EditorData) {
  return {
    workspaces: new WorkspacesModel(data.workspaces),
    fileTree:
      data.fileTree !== null && data.workspaces.selectedId !== null
        ? {
            wsId: data.workspaces.selectedId,
            tree: new FileTreeModel(data.fileTree, data.workspaces.selectedId),
          }
        : null,
  };
}

export type EditorModels = ReturnType<typeof createModels>;

export const { Provider: EditorModelsProvider, use: useEditorModels } =
  createModelContext<EditorModels>("EditorModels");
