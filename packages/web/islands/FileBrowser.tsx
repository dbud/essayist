import { openFile, selectedFile } from "@/signals.ts";
import { useFiles } from "@/hooks/useFiles.ts";
import { buildFileTree, type TreeNode } from "@/utils/fileTree.ts";
import { FileText, Folder, FolderOpen } from "lucide-preact";
import { useMemo } from "preact/hooks";
import { useSignal } from "@preact/signals";

function FolderItem({ node }: { node: TreeNode }) {
  const open = useSignal(true);

  return (
    <li>
      <details open={open.value}>
        <summary
          onClick={(e) => {
            e.preventDefault();
            open.value = !open.value;
          }}
        >
          {open.value ? <FolderOpen size={16} /> : <Folder size={16} />}
          {node.name}
        </summary>
        <ul>
          {node.children.map((child) =>
            child.isFile
              ? <FileItem key={child.path} node={child} />
              : <FolderItem key={child.path} node={child} />
          )}
        </ul>
      </details>
    </li>
  );
}

function FileItem({ node }: { node: TreeNode }) {
  const isSelected = selectedFile.value === node.path;

  return (
    <li>
      <a
        class={isSelected ? "bg-primary/10" : ""}
        onClick={() => openFile(node.path)}
      >
        <FileText size={16} />
        {node.name}
      </a>
    </li>
  );
}

export default function FileBrowser() {
  const { files, loading, error } = useFiles();
  const tree = useMemo(() => buildFileTree(files.value), [files.value]);

  if (loading.value) {
    return <span class="loading loading-spinner loading-sm" />;
  }

  if (error.value) {
    return <div class="text-error">{error.value}</div>;
  }

  return (
    <ul class="menu bg-base-200 w-full">
      {tree.children.map((node) =>
        node.isFile
          ? <FileItem key={node.path} node={node} />
          : <FolderItem key={node.path} node={node} />
      )}
    </ul>
  );
}
