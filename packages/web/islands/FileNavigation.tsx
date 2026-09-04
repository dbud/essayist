import { useSignal } from "@preact/signals";
import { ArrowDownRight, ChevronDown, Plus, Slash } from "lucide-preact";
import type { TargetedMouseEvent } from "preact";
import Panel from "@/components/ui/Panel.tsx";
import Swappable from "@/components/ui/Swappable.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { useClickOutside } from "@/hooks/useClickOutside.ts";
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

function BreadcrumbsTrigger() {
  const selectedWorkspace = workspaces.current.value?.name ?? "";
  const selectedPath = getOpenedFiles()?.selected.value ?? "";

  const open = (e: TargetedMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    navigationOpened.value = true;
  };

  return (
    <Swappable
      swapKey={
        workspaces.loading.value
          ? "loading"
          : navigationOpened.value
            ? "open"
            : "closed"
      }
      class="swap-slide leading-none relative z-dropdown"
    >
      <div class="flex stack stack--row">
        {workspaces.loading.value ? (
          <WaveBars class="h-10 text-ink/70 bg-surface" />
        ) : navigationOpened.value ? (
          <div class="cell cell--ink w-48 relative">
            <WaveBars
              fill
              amplitude={workspaces.loading.value ? 1 : 0}
              class="text-surface"
            />
            <ArrowDownRight size={14} />
            Projects
          </div>
        ) : (
          <button type="button" class="btn max-w-lg" onClick={open}>
            <span class="truncate min-w-0">{selectedWorkspace}</span>
            {selectedPath && (
              <>
                <Slash size={14} />
                <span class="truncate min-w-0">{selectedPath}</span>
              </>
            )}
            <ChevronDown size={14} />
          </button>
        )}
      </div>
    </Swappable>
  );
}

export default function FileNavigation() {
  const createWorkspaceDialogOpen = useSignal(false);
  const createFileDialogOpen = useSignal(false);
  const filesPanelOpen = useSignal(navigationOpened.value);

  const ref = useClickOutside(() => (navigationOpened.value = false));

  const files = getFileTree();
  const selectedPath = getOpenedFiles()?.selected.value ?? "";
  const fileEntries = buildFileEntries(
    files?.tree.value.children ?? [],
    selectedPath,
  );

  const createFile = (
    <>
      <button
        type="button"
        class="btn"
        onClick={() => (createFileDialogOpen.value = true)}
        data-tooltip="Start writing from scratch"
      >
        <Plus size={14} />
        New file&hellip;
      </button>
      <FileUploader />
      <GoogleDocImporter />
    </>
  );

  const filesList = (
    <Panel
      class="dropdown--like absolute left-full top-[-1px] z-dropdown min-w-72"
      open={filesPanelOpen.value}
    >
      <div class="flex flex-col stack" data-stagger-children>
        {fileEntries.map(
          ({ path, parts, selected: fileSelected, name: fileName }) => (
            <button
              key={path}
              type="button"
              class={`group btn ${fileSelected ? "is-selected" : ""}`}
              onClick={() => {
                getOpenedFiles()?.open(path);
                navigationOpened.value = false;
              }}
            >
              {parts.map((p, i) => (
                <span
                  key={i}
                  class={`transition-opacity ${p.redundant ? "opacity-50 group-hover:opacity-100" : ""}`}
                >
                  {p.segment}
                  <span class="pl-1">/</span>
                </span>
              ))}
              <span class="break-all min-w-0">{fileName}</span>
            </button>
          ),
        )}
        {(files?.files.value.length ?? 0) > 0 && <div class="separator" />}
        {createFile}
      </div>
    </Panel>
  );

  const createWorkspace = (
    <button
      type="button"
      class="btn"
      onClick={() => (createWorkspaceDialogOpen.value = true)}
    >
      <Plus size={14} /> New project&hellip;
    </button>
  );

  const workspacesList = workspaces.list.value.map(({ id, name }) => {
    const selected = id === workspaces.currentWorkspaceId.value;
    return (
      <div class="relative flex" key={id}>
        <button
          type="button"
          class={`btn min-w-48 ${selected ? "is-selected" : ""}`}
          onClick={() => workspaces.select(id)}
        >
          {name}
          {selected && <ArrowDownRight size={14} class="absolute right-1" />}
          <WaveBars
            fill
            amplitude={selected && files?.loading.value ? 0.5 : 0}
            class="text-surface"
          />
        </button>
        {selected && filesList}
      </div>
    );
  });

  return (
    <div ref={ref} class="relative inline-flex">
      <BreadcrumbsTrigger />

      <div class="absolute top-full left-0 z-dropdown">
        <Panel
          class="dropdown--like"
          open={navigationOpened.value}
          onSettled={() => (filesPanelOpen.value = navigationOpened.value)}
        >
          <div class="flex flex-col stack min-w-48" data-stagger-children>
            {workspacesList}
            {workspaces.list.value.length > 0 && <div class="separator" />}
            {createWorkspace}
          </div>
        </Panel>
      </div>

      <CreateWorkspaceDialog open={createWorkspaceDialogOpen} />
      <CreateFileDialog
        open={createFileDialogOpen}
        onCreated={() => (navigationOpened.value = false)}
      />
    </div>
  );
}
