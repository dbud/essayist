import { useSignal } from "@preact/signals";
import { Briefcase, ChevronDown, FileText, Plus, Slash } from "lucide-preact";
import Panel from "@/components/ui/Panel.tsx";
import Spinner from "@/components/ui/Spinner.tsx";
import { useClickOutside } from "@/hooks/useClickOutside.ts";
import { useViewTransitionState } from "@/hooks/useViewTransitionState.ts";
import CreateFileDialog from "@/islands/CreateFileDialog.tsx";
import CreateWorkspaceDialog from "@/islands/CreateWorkspaceDialog.tsx";
import FileUploader from "@/islands/FileUploader.tsx";
import GoogleDocImporter from "@/islands/GoogleDocImporter.tsx";
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

function buildFileEntries(
  nodes: TreeNode[],
  selectedPath: string,
): FileEntry[] {
  const result: FileEntry[] = [];
  let prevSegments: string[] = [];

  function walk(nodes: TreeNode[], segments: string[]) {
    for (const { name, path, isFile, children } of nodes) {
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
          selected: path === selectedPath,
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
  const createWorkspaceDialogOpen = useSignal(false);
  const createFileDialogOpen = useSignal(false);
  const ref = useClickOutside(() => (navigationOpened.value = false));

  const files = getFileTree();
  const selectedPath = getOpenedFiles()?.selected.value ?? "";
  const entries = buildFileEntries(
    files?.tree.value.children ?? [],
    selectedPath,
  );

  const fileEntries = useViewTransitionState(
    entries,
    files?.loading.value ?? false,
  );

  if (files?.error.value) {
    return <div class="text-error">{files.error.value}</div>; // TODO -- toast?
  }
  // TODO -- workspaces.error?

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
      class="btn btn--ghost max-w-xs"
      onClick={() => (navigationOpened.value = !navigationOpened.value)}
    >
      <FileText size={14} class="shrink-0" />
      <span class="truncate min-w-0">{selectedPath || ""}</span>
      <ChevronDown size={14} class="shrink-0" />
    </button>
  );

  const createWorkspace = (
    <button
      type="button"
      class="btn btn--ghost"
      onClick={() => (createWorkspaceDialogOpen.value = true)}
    >
      <Plus size={14} />
      New project
    </button>
  );

  const wsList = (
    <div class="flex flex-col py-4 gap-4">
      <h3 class="text-lg font-thin">Projects</h3>
      {workspaces.loading.value ? (
        <Spinner />
      ) : (
        <ul class="flex flex-col">
          {workspaces.list.value.map(({ id, name }) => (
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
      )}
      {createWorkspace}
    </div>
  );

  const createFile = (
    <button
      type="button"
      class="btn btn--ghost"
      onClick={() => (createFileDialogOpen.value = true)}
    >
      <Plus size={14} />
      Create new file
    </button>
  );

  const fileList = (
    <div class="flex flex-col py-4 gap-4">
      <h3 class="text-lg font-thin">Files</h3>
      {fileEntries.value.state === "loading" ? (
        <Spinner />
      ) : (
        <ul class="flex flex-col" style="view-transition-name: file-list">
          {fileEntries.value.data.map((entry) => (
            <li key={entry.path} class="group w-fit">
              {entry.parts.map((p, i) => (
                <span
                  key={i}
                  class={`btn--size transition-opacity ${p.redundant ? "opacity-50 group-hover:opacity-100" : ""}`}
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
      )}
      {fileEntries.value.state === "data" && (
        <div class="flex flex-col gap-2">
          <div>{createFile}</div>
          <div class="flex gap-2">
            <FileUploader />
            <GoogleDocImporter />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div ref={ref} class="flex items-center py-2">
        <div class="flex flex-col">
          <Panel open={!navigationOpened.value}>
            {fileEntries.value.state === "loading" ||
            workspaces.loading.value ? (
              <Spinner />
            ) : (
              <div class="flex gap-2">
                {wsTrigger}
                {files && <Slash size={16} class="hidden @lg:block" />}
                {files && fileTrigger}
              </div>
            )}
          </Panel>
          <Panel open={navigationOpened.value}>
            <div class="flex flex-wrap gap-x-24 gap-y-4">
              {wsList}
              {files && fileList}
            </div>
          </Panel>
        </div>
      </div>

      <CreateWorkspaceDialog open={createWorkspaceDialogOpen} />
      <CreateFileDialog
        open={createFileDialogOpen}
        onCreated={() => (navigationOpened.value = false)}
      />
    </>
  );
}
