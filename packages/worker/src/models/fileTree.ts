import { batch, computed, createModel, signal } from "@preact/signals";
import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson } from "#/models/utils/http.ts";
import type { FileTreeData } from "./fileTree.data";

export type { FileTreeData };

// TODO -- createFile and uploadFiles when the files api lands
export const FileTreeModel = createModel(
  (wsId: string, data?: FileTreeData) => {
    const files = signal(data?.files ?? []);
    const selectedPath = signal(data?.selectedPath ?? null);
    const selectedVersionId = signal(data?.selectedVersionId ?? null);

    const tree = computed(() => buildFileTree(files.value));

    const [runLoad, { loading, error }] = createAsyncState();

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId });
      const data = await runLoad(async () =>
        getJson<FileTreeData>(`/api/workspaces/files?${params}`),
      );
      if (data) {
        files.value = data.files;
        selectedPath.value = data.selectedPath;
      }
    }

    if (data === undefined && !import.meta.env.SSR) void load();

    function select(path: string | null, versionId?: string | null): void {
      batch(() => {
        selectedPath.value = path;
        // A file switch points at its latest version unless an id arrives.
        selectedVersionId.value =
          versionId ??
          (path === null
            ? null
            : (files.value.find((file) => file.path === path)
                ?.latestVersionId ?? null));
      });
    }

    function selectVersion(versionId: string | null): void {
      selectedVersionId.value = versionId;
    }

    return {
      files,
      selectedPath,
      selectedVersionId,
      select,
      selectVersion,
      tree,
      load,
      loading,
      error,
    };
  },
);

export type FileTree = InstanceType<typeof FileTreeModel>;

export interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
}

function buildFileTree(files: FileTreeData["files"]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    isFile: false,
    children: [],
  };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          path,
          isFile,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    sortTree(child);
  }
}
