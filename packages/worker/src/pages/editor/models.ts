import { createModelContext } from "#/models/context.ts";
import { WorkspacesModel } from "#/models/workspaces.ts";
import type { EditorData } from "./data";

export default function createModels(data: EditorData) {
  return { workspaces: new WorkspacesModel(data.workspaces) };
}

export type EditorModels = ReturnType<typeof createModels>;

export const { Provider: EditorModelsProvider, use: useEditorModels } =
  createModelContext<EditorModels>("EditorModels");
