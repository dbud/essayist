import { CategoriesModel } from "#/models/categories.ts";
import { FileContentsModel } from "#/models/fileContents.ts";
import { FileReviewByKeyModel } from "#/models/fileReviewByKey.ts";
import { createFileSelection } from "#/models/fileSelection.ts";
import { FileTreesModel } from "#/models/fileTrees.ts";
import { FileVersionsByKeyModel } from "#/models/fileVersionsByKey.ts";
import { createFileWritability } from "#/models/fileWritability.ts";
import { createResolvedMarks } from "#/models/resolvedMarks.ts";
import { ReviewRunsByKeyModel } from "#/models/reviewRunsByKey.ts";
import { SidenotesByKeyModel } from "#/models/sidenotesByKey.ts";
import { createModelContext } from "#/models/utils/context.ts";
import { WorkspacesModel } from "#/models/workspaces.ts";
import type { UserData } from "#/state.ts";

import type { EditorData } from "./data";

export default function createModels(data: EditorData, user: UserData | undefined) {
  const workspaces = new WorkspacesModel(data.workspaces);
  const fileTrees = new FileTreesModel(workspaces.selectedId, data.fileTrees);
  const selected = createFileSelection(workspaces, fileTrees);
  const fileContents = new FileContentsModel(selected, fileTrees, data.fileView?.content);
  const fileVersions = new FileVersionsByKeyModel(selected, data.fileView?.versions);
  const streamDetail = user?.role === "admin" ? "trace" : "progress";
  const reviewRuns = new ReviewRunsByKeyModel(selected, streamDetail, data.reviewRuns ?? undefined);
  const reviews = new FileReviewByKeyModel(selected, reviewRuns.current, data.fileView?.review);
  const categories = new CategoriesModel(data.categories);
  const writable = createFileWritability(selected, fileVersions);
  const resolvedMarks = createResolvedMarks(fileContents, reviews);
  const sidenotes = new SidenotesByKeyModel(selected, resolvedMarks, categories);
  return {
    workspaces,
    fileTrees,
    selected,
    writable,
    fileContents,
    fileVersions,
    reviews,
    reviewRuns,
    resolvedMarks,
    sidenotes,
    categories,
  };
}

export type EditorModels = ReturnType<typeof createModels>;

export const { Provider: EditorModelsProvider, use: useEditorModels } =
  createModelContext<EditorModels>("EditorModels");
