import { createModel, signal } from "@preact/signals";
import { get, modelData, namespace } from "@/signals/models.ts";

/** The user's persisted selected workspace. */
export const selectedWorkspaceNs = namespace<string | null>(
  "selectedWorkspace",
);

export const SelectedWorkspaceModel = createModel(() => {
  const workspaceId = signal<string | null>(null);
  const { loading, error } = modelData(
    selectedWorkspaceNs,
    "singleton",
    (data) => (workspaceId.value = data),
  );
  return { workspaceId, loading, error };
});

export type SelectedWorkspace = InstanceType<typeof SelectedWorkspaceModel>;

export function getSelectedWorkspace(): SelectedWorkspace {
  return get(
    selectedWorkspaceNs,
    "singleton",
    () => new SelectedWorkspaceModel(),
  );
}

/** The user's persisted selected file within one workspace. */
export const selectedFileNs = namespace<string | null>("selectedFile");

export const SelectedFileModel = createModel((workspaceId: string) => {
  const path = signal<string | null>(null);
  const { loading, error } = modelData(
    selectedFileNs,
    workspaceId,
    (data) => (path.value = data),
  );
  return { path, loading, error };
});

export type SelectedFile = InstanceType<typeof SelectedFileModel>;

export function getSelectedFileFor(workspaceId: string): SelectedFile {
  return get(
    selectedFileNs,
    workspaceId,
    () => new SelectedFileModel(workspaceId),
  );
}
