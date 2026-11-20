import type { User } from "@essayist/core";

import { CategoriesModel } from "#/models/categories.ts";
import { FileContentsModel } from "#/models/fileContents.ts";
import { FileMarksByPathModel } from "#/models/fileMarksByPath.ts";
import { createFileSelection } from "#/models/fileSelection.ts";
import { FileTreesModel } from "#/models/fileTrees.ts";
import { FileVersionsByPathModel } from "#/models/fileVersionsByPath.ts";
import { createFileWritability } from "#/models/fileWritability.ts";
import { createResolvedMarks } from "#/models/resolvedMarks.ts";
import { ReviewRunsByPathModel } from "#/models/reviewRunsByPath.ts";
import { SidenotesByPathModel } from "#/models/sidenotesByPath.ts";
import { createModelContext } from "#/models/utils/context.ts";
import { WorkspacesModel } from "#/models/workspaces.ts";

import type { EditorData } from "./data";

export default function createModels(data: EditorData, user: User | undefined) {
  const workspaces = new WorkspacesModel(data.workspaces);
  const fileTrees = new FileTreesModel(workspaces.selectedId, data.fileTrees);
  const selected = createFileSelection(workspaces, fileTrees);
  const fileContents = new FileContentsModel(selected, data.fileView?.content);
  const fileVersions = new FileVersionsByPathModel(selected, data.fileView?.versions);
  const streamDetail = user?.role === "admin" ? "trace" : "progress";
  const reviewRuns = new ReviewRunsByPathModel(
    selected,
    streamDetail,
    data.reviewRuns ?? undefined,
  );
  const marks = new FileMarksByPathModel(selected, reviewRuns.current, data.fileView?.marks);
  const categories = new CategoriesModel(data.categories);
  const writable = createFileWritability(selected, fileVersions);
  const resolvedMarks = createResolvedMarks(fileContents, marks);
  const sidenotes = new SidenotesByPathModel(selected, resolvedMarks, categories);
  return {
    workspaces,
    fileTrees,
    selected,
    writable,
    fileContents,
    fileVersions,
    marks,
    reviewRuns,
    resolvedMarks,
    sidenotes,
    categories,
  };
}

export type EditorModels = ReturnType<typeof createModels>;

export const { Provider: EditorModelsProvider, use: useEditorModels } =
  createModelContext<EditorModels>("EditorModels");
