import { useSignal } from "@preact/signals";
import { FileText, Folder, FolderOpen } from "lucide-preact";
import { type TreeNode, useFiles } from "@/signals/fileTree.ts";
import { openedFiles } from "@/signals/openedFiles.ts";

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
  return (
    <li>
      <button
        type="button"
        class={`${node.isSelected.value ? "bg-primary/10" : ""} w-full`}
        onClick={() => openedFiles.open(node.path)}
      >
        <FileText size={16} class="shrink-0" />
        <span class="break-all min-w-0">{node.name}</span>
      </button>
    </li>
  );
}

export default function FileBrowser() {
  const { tree, loading, error } = useFiles();

  if (error.value) {
    return <div class="text-error">{error.value}</div>;
  }

  return (
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
  );
}
