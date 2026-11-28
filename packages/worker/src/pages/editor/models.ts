import { CategoriesModel } from "#/models/categories.ts";
import { FileContentsModel } from "#/models/fileContents.ts";
import { FileReviewByPathModel } from "#/models/fileReviewByPath.ts";
import { createFileSelection } from "#/models/fileSelection.ts";
import { FileTreesModel } from "#/models/fileTrees.ts";
import { FileVersionsByPathModel } from "#/models/fileVersionsByPath.ts";
import { createFileWritability } from "#/models/fileWritability.ts";
import { createResolvedMarks } from "#/models/resolvedMarks.ts";
import { ReviewRunsByPathModel } from "#/models/reviewRunsByPath.ts";
import { SidenotesByPathModel } from "#/models/sidenotesByPath.ts";
import { createModelContext } from "#/models/utils/context.ts";
import { WorkspacesModel } from "#/models/workspaces.ts";
import type { UserData } from "#/state.ts";

import type { EditorData } from "./data";

export default function createModels(data: EditorData, user: UserData | undefined) {
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
  const reviews = new FileReviewByPathModel(selected, reviewRuns.current, data.fileView?.review);
  const categories = new CategoriesModel(data.categories);
  const writable = createFileWritability(selected, fileVersions);
  const resolvedMarks = createResolvedMarks(fileContents, reviews);
  const sidenotes = new SidenotesByPathModel(selected, resolvedMarks, categories);
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
