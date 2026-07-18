import { useSignal } from "@preact/signals";
import { FileText, Folder, FolderOpen, Plus } from "lucide-preact";
import CreateFileDialog from "@/islands/CreateFileDialog.tsx";
import { getFileTree, type TreeNode } from "@/signals/fileTree.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";

function FolderItem({ node }: { node: TreeNode }) {
  const open = useSignal(true);

  return (
    <li>
      <details open={open.value}>
        {/** biome-ignore lint/a11y/useSemanticElements: summary is clickable */}
        <summary
          role="button"
          class="w-full"
          onClick={(e) => {
            e.preventDefault();
            open.value = !open.value;
          }}
        >
          {open.value ? (
            <FolderOpen size={16} class="shrink-0" />
          ) : (
            <Folder size={16} class="shrink-0" />
          )}
          <span class="break-all min-w-0">{node.name}</span>
        </summary>
        <ul>
          {node.children.map((child) =>
            child.isFile ? (
              <FileItem key={child.path} node={child} />
            ) : (
              <FolderItem key={child.path} node={child} />
            ),
          )}
        </ul>
      </details>
    </li>
  );
}

function FileItem({ node }: { node: TreeNode }) {
  const openedFiles = getOpenedFiles();
  return (
    <li>
      <button
        type="button"
        class={`${node.isSelected.value ? "bg-primary/10" : ""} w-full`}
        onClick={() => openedFiles?.open(node.path)}
      >
        <FileText size={16} class="shrink-0" />
        <span class="break-all min-w-0">{node.name}</span>
      </button>
    </li>
  );
}

export default function FileBrowser() {
  const dialogOpen = useSignal(false);
  const files = getFileTree();
  if (!files) return null;
  const { tree, loading, error } = files;

  if (error.value) {
    return <div class="text-error">{error.value}</div>;
  }

  return (
    <div class="flex flex-col gap-1">
      <ul
        class={`menu bg-base-200 w-full ${loading.value ? "loading-border" : ""}`}
      >
        {tree.value.children.map((node) =>
          node.isFile ? (
            <FileItem key={node.path} node={node} />
          ) : (
            <FolderItem key={node.path} node={node} />
          ),
        )}
      </ul>
      <div class="flex items-center justify-between px-2">
        <button
          type="button"
          class="btn btn-sm"
          onClick={() => (dialogOpen.value = true)}
          title="New file"
        >
          <Plus size={16} />
          New file
        </button>
      </div>
      <CreateFileDialog open={dialogOpen} />
    </div>
  );
}
