import { useSignal } from "@preact/signals";
import { Briefcase, ChevronDown, FileText, Plus, Slash } from "lucide-preact";
import ContentLayout from "@/components/ui/ContentLayout.tsx";
import Panel from "@/components/ui/Panel.tsx";

import CreateWorkspaceDialog from "@/islands/CreateWorkspaceDialog.tsx";
import { getFileTree, type TreeNode } from "@/signals/fileTree.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
import { navigationOpened } from "@/signals/sidebar.ts";
import { workspaces } from "@/signals/workspace.ts";

interface PathPart {
  segment: string;
  redundant: boolean;
}

interface FileEntry {
  parts: PathPart[];
  name: string;
  path: string;
  selected: boolean;
}

function buildFileEntries(nodes: TreeNode[]): FileEntry[] {
  const result: FileEntry[] = [];
  let prevSegments: string[] = [];

  function walk(nodes: TreeNode[], segments: string[]) {
    for (const { name, path, isFile, isSelected, children } of nodes) {
      if (isFile) {
        const parts: PathPart[] = segments.map((segment, i) => ({
          segment,
          redundant: prevSegments.length > i && prevSegments[i] === segment,
        }));
        prevSegments = [...segments];
        result.push({
          parts,
          name,
          path,
          selected: isSelected.value,
        });
      } else {
        walk(children, [...segments, name]);
      }
    }
  }

  walk(nodes, []);
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

  const selectedPath = getOpenedFiles()?.selected.value ?? "";
  const entries = buildFileEntries(tree.value.children);

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
        {entries.map((entry) => (
          <li key={entry.path} class="group w-fit">
            {entry.parts.map((p, i) => (
              <span
                key={i}
                class={`btn--size transition-opacity ${p.redundant ? "opacity-0 group-hover:opacity-100" : ""}`}
              >
                {p.segment}
                <span class="px-1">/</span>
              </span>
            ))}
            <button
              type="button"
              class={`font-normal btn btn--ghost ${entry.selected ? "is-selected" : ""}`}
              onClick={() => {
                getOpenedFiles()?.open(entry.path);
                navigationOpened.value = false;
              }}
            >
              <span class="break-all min-w-0">{entry.name}</span>
            </button>
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
