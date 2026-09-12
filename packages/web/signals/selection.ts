import { createModel, signal } from "@preact/signals";
import { get, modelData, namespace } from "@/signals/models.ts";

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
