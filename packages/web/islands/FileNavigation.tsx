import { useSignal } from "@preact/signals";
import {
  Briefcase,
  ChevronDown,
  FileText,
  FolderOpen,
  Plus,
  Slash,
} from "lucide-preact";
import ContentLayout from "@/components/ui/ContentLayout.tsx";
import Panel from "@/components/ui/Panel.tsx";

import CreateWorkspaceDialog from "@/islands/CreateWorkspaceDialog.tsx";
import { getFileTree, type TreeNode } from "@/signals/fileTree.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
import { navigationOpened } from "@/signals/sidebar.ts";
import { workspaces } from "@/signals/workspace.ts";

function flattenTree(
  nodes: TreeNode[],
  depth = 0,
): Array<TreeNode & { depth: number }> {
  const result: Array<TreeNode & { depth: number }> = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (!node.isFile) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

export default function FileNavigation() {
  const createDialogOpen = useSignal(false);

  const files = getFileTree();
  if (!files) return null;
  const { tree, error, loading } = files;

  if (error.value) {
    return <div class="text-error">{error.value}</div>;
  }

  const items = flattenTree(tree.value.children);
  const selectedPath = getOpenedFiles()?.selected.value ?? "";

  const wsTrigger = (
    <button
      type="button"
      class="btn btn--ghost"
      onClick={() => (navigationOpened.value = !navigationOpened.value)}
    >
      <Briefcase size={14} />
      {workspaces.current.value?.name ?? ""}
      <ChevronDown size={14} />
    </button>
  );

  const fileTrigger = (
    <button
      type="button"
      class="btn btn--ghost"
      onClick={() => (navigationOpened.value = !navigationOpened.value)}
    >
      <FileText size={14} />
      {selectedPath || "..." /* TODO placeholder */}
      <ChevronDown size={14} />
    </button>
  );

  const wsList = (
    <div class="flex flex-col py-4 gap-4">
      <h3 class="text-lg font-thin">Projects</h3>
      <ul class="flex flex-col">
        {workspaces.list.value.length > 1 &&
          workspaces.list.value.map(({ id, name }) => (
            <li key={id}>
              <button
                type="button"
                class={`font-normal btn btn--ghost ${id === workspaces.currentWorkspaceId.value ? "is-selected" : ""}`}
                onClick={() => {
                  workspaces.select(id);
                }}
              >
                {name}
              </button>
            </li>
          ))}
      </ul>
      <button
        type="button"
        class="btn btn--accent"
        onClick={() => {
          navigationOpened.value = false;
          createDialogOpen.value = true;
        }}
      >
        <Plus size={14} />
        New project
      </button>
    </div>
  );

  const fileList = (
    <div class="flex flex-col py-4 gap-4">
      <h3 class="text-lg font-thin">Files</h3>
      <ul class="flex flex-col">
        {items.filter((n) => n.isFile).length > 1 &&
          items.map(({ isFile, isSelected, path, depth, name }) => (
            <li key={path} style={{ paddingInlineStart: `${1.5 * depth}rem` }}>
              {isFile ? (
                <button
                  type="button"
                  class={`font-normal btn btn--ghost ${isSelected.value ? "is-selected" : ""}`}
                  onClick={() => {
                    getOpenedFiles()?.open(path);
                    navigationOpened.value = false;
                  }}
                >
                  <span class="break-all min-w-0">{name}</span>
                </button>
              ) : (
                <button
                  type="button"
                  class="font-normal btn btn--ghost"
                  disabled
                >
                  <FolderOpen size={14} />
                  <span class="break-all min-w-0">{name}</span>
                </button>
              )}
            </li>
          ))}
      </ul>
    </div>
  );

  return (
    <Panel
      open
      class={`flex items-center gap-2 py-2 bg-pane text-pane-content ${loading.value ? "loading-border" : ""}`}
      onClickOutside={() => (navigationOpened.value = false)}
    >
      <ContentLayout>
        {({ mainClass }) => (
          <div class={mainClass}>
            <div class="flex flex-col">
              <Panel open={!navigationOpened.value}>
                <div class="flex gap-2">
                  {wsTrigger}
                  <Slash size={16} />
                  {fileTrigger}
                </div>
              </Panel>
              <Panel open={navigationOpened.value}>
                <div class="flex gap-24">
                  {wsList}
                  {fileList}
                </div>
              </Panel>
            </div>
          </div>
        )}
      </ContentLayout>
      <CreateWorkspaceDialog open={createDialogOpen} />
    </Panel>
  );
}
