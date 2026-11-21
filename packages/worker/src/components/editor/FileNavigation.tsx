import { type Signal, useSignal } from "@preact/signals";
import { ChevronDown, ChevronRight, Plus, Slash, Trash2 } from "lucide-preact";

import CreateFileDialog from "#/components/editor/CreateFileDialog.tsx";
import CreateWorkspaceDialog from "#/components/editor/CreateWorkspaceDialog.tsx";
import DeleteWorkspaceDialog from "#/components/editor/DeleteWorkspaceDialog.tsx";
import FileUploader from "#/components/editor/FileUploader.tsx";
import GoogleDocImporter from "#/components/editor/GoogleDocImporter.tsx";
import AqSwap from "#/components/ui/AqSwap.tsx";
import Melt from "#/components/ui/Melt.tsx";
import WaveBars from "#/components/ui/WaveBars.tsx";
import { useClickOutside } from "#/hooks/useClickOutside.ts";
import type { TreeNode } from "#/models/fileTree.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { useAppState } from "#/state.ts";

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

function buildFileEntries(nodes: TreeNode[], selectedPath: string | null): FileEntry[] {
  const result: FileEntry[] = [];
  let prevSegments: string[] = [];

  function walk(subtree: TreeNode[], segments: string[]) {
    for (const { name, path, isFile, children } of subtree) {
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

interface FileNavigationProps {
  open: Signal<boolean>;
}

export default function FileNavigation({ open }: FileNavigationProps) {
  const createWorkspaceDialogOpen = useSignal(false);
  const createFileDialogOpen = useSignal(false);
  const deleteWorkspaceDialogOpen = useSignal(false);

  const close = () => {
    open.value = false;
    createFileDialogOpen.value = false;
    createWorkspaceDialogOpen.value = false;
    deleteWorkspaceDialogOpen.value = false;
  };

  const ref = useClickOutside(close);

  const { user } = useAppState();
  const { workspaces, fileTrees, selected } = useEditorModels();
  const files = fileTrees.current.value;
  const selectedPath = selected.value?.path ?? null;
  const selectedWorkspace = workspaces.current.value?.name ?? null;
  const fileEntries = buildFileEntries(files?.tree.value.children ?? [], selectedPath);
  const showNav =
    open.value &&
    !createFileDialogOpen.value &&
    !createWorkspaceDialogOpen.value &&
    !deleteWorkspaceDialogOpen.value;
  const ownsSelected = user !== undefined && workspaces.current.value?.ownerId === user.id;

  const breadcrumbsTrigger = (
    <AqSwap on={`${selectedWorkspace}/${selectedPath}`}>
      <button
        type="button"
        class="aq-btn max-w-lg"
        aria-expanded={open.value}
        onClick={() => (open.value = !open.value)}
      >
        <WaveBars fill amplitude={workspaces.loading.value ? 1 : 0} data-static />
        <span class="truncate min-w-0">{selectedWorkspace}</span>
        {selectedPath !== null && (
          <>
            <Slash />
            <span class="truncate min-w-0">{selectedPath}</span>
          </>
        )}
        <ChevronDown data-static />
      </button>
    </AqSwap>
  );

  const createFile = (
    <div class="aq-menu self-start">
      <ul class="aq-menu-rows" data-aq-stagger>
        <li>
          <button
            type="button"
            class="aq-menu-btn"
            onClick={() => (createFileDialogOpen.value = true)}
            data-tooltip="Start writing from scratch"
          >
            <Plus />
            <span>New file&hellip;</span>
          </button>
        </li>
        <li>
          <FileUploader />
        </li>
        <li>
          <GoogleDocImporter onImported={close} />
        </li>
      </ul>
    </div>
  );

  const deleteWorkspace = ownsSelected && (
    <button
      type="button"
      class="aq-btn self-start"
      onClick={() => (deleteWorkspaceDialogOpen.value = true)}
    >
      <Trash2 />
      <span>Delete project&hellip;</span>
    </button>
  );

  const filesList = (
    <div class={`aq-dropdown--right-bridged aq-dropdown--fit max-w-96 ${showNav ? "is-open" : ""}`}>
      <span class="aq-dropdown-bridge" aria-hidden="true" />
      {fileEntries.length > 0 && (
        <div class="aq-menu aq-menu--wrap">
          <ul class="aq-menu-rows" data-aq-stagger>
            {fileEntries.map(({ path, parts, selected: fileSelected, name: fileName }) => (
              <li key={path}>
                <button
                  type="button"
                  class={`aq-menu-btn group ${fileSelected ? "is-selected" : ""}`}
                  onClick={() => {
                    files?.select(path);
                    close();
                  }}
                >
                  {parts.map((p, i) => (
                    <span
                      key={i}
                      class={`transition-colors ${p.redundant ? "text-current/50 group-hover:text-current" : ""}`}
                    >
                      {p.segment}
                      <span class="pl-1">/</span>
                    </span>
                  ))}
                  <span class="break-words min-w-0">{fileName}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {createFile}
      {deleteWorkspace}
    </div>
  );

  const createWorkspace = (
    <button type="button" class="aq-btn" onClick={() => (createWorkspaceDialogOpen.value = true)}>
      <Plus />
      <span>New project&hellip;</span>
    </button>
  );

  const workspacesList = workspaces.list.value.map(({ id, name }) => {
    const isSelected = id === workspaces.selectedId.value;
    return (
      <li class="relative flex" key={id}>
        <button
          type="button"
          class={`aq-menu-btn min-w-48 ${isSelected ? "is-selected" : ""}`}
          onClick={() => workspaces.select(id)}
        >
          {name}
          {isSelected && <ChevronRight class="absolute right-1" />}
          <WaveBars
            fill
            amplitude={isSelected && files?.loading.value ? 0.5 : 0}
            class="text-surface"
          />
        </button>
        {isSelected && filesList}
      </li>
    );
  });

  return (
    <Melt class="inline-flex z-panel" ref={ref}>
      {breadcrumbsTrigger}

      <div class={`aq-dropdown aq-dropdown--detached ${showNav ? "is-open" : ""}`}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {workspacesList}
          </ul>
        </div>
        {createWorkspace}
      </div>

      <CreateWorkspaceDialog open={createWorkspaceDialogOpen} />
      <DeleteWorkspaceDialog open={deleteWorkspaceDialogOpen} onDeleted={close} />
      <CreateFileDialog open={createFileDialogOpen} onCreated={close} />
    </Melt>
  );
}
