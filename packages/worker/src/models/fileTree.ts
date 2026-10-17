import { computed, createModel, signal } from "@preact/signals";
import createAsyncState from "#/models/asyncState.ts";
import { getJson } from "#/models/http.ts";
import type { FileTreeData } from "./fileTree.data";

export type { FileTreeData };

// TODO -- createFile and uploadFiles when the files api lands
export const FileTreeModel = createModel((data: FileTreeData, wsId: string) => {
  const files = signal(data.files);
  const selectedPath = signal(data.selectedPath);

  const tree = computed(() => buildFileTree(files.value));

  const [runRefresh, { loading, error }] = createAsyncState();

  async function refresh(): Promise<void> {
    await runRefresh(async () => {
      const params = new URLSearchParams({ wsId });
      const data = await getJson<FileTreeData>(
        `/api/workspaces/files?${params}`,
      );
      files.value = data.files;
      selectedPath.value = data.selectedPath;
    });
  }

  function select(path: string | null): void {
    selectedPath.value = path;
  }

  return {
    files,
    selectedPath,
    select,
    tree,
    loading,
    error,
    refresh,
  };
});

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
