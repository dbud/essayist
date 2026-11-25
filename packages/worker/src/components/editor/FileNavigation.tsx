import { type Signal, useSignal } from "@preact/signals";
import { ChevronDown, ChevronRight, Plus, Slash, Trash2 } from "lucide-preact";

import CreateFileDialog from "#/components/editor/CreateFileDialog.tsx";
import CreateWorkspaceDialog from "#/components/editor/CreateWorkspaceDialog.tsx";
import DeleteWorkspaceDialog from "#/components/editor/DeleteWorkspaceDialog.tsx";
import FileUploader from "#/components/editor/FileUploader.tsx";
import GoogleDocImporter from "#/components/editor/GoogleDocImporter.tsx";
import RemoveFileDialog from "#/components/editor/RemoveFileDialog.tsx";
import Melt from "#/components/ui/Melt.tsx";
import Swap from "#/components/ui/Swap.tsx";
import WaveBars from "#/components/ui/WaveBars.tsx";
import { useClickOutside } from "#/hooks/useClickOutside.ts";
import { useOutgoing } from "#/hooks/useOutgoing.ts";
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
  const creatingWorkspace = useSignal(false);
  const creatingFile = useSignal(false);
  const deletingWorkspace = useSignal(false);
  const removingPath = useSignal<string | null>(null);

  const close = () => {
    open.value = false;
    creatingFile.value = false;
    creatingWorkspace.value = false;
    deletingWorkspace.value = false;
    removingPath.value = null;
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
    !creatingFile.value &&
    !creatingWorkspace.value &&
    !deletingWorkspace.value &&
    removingPath.value === null;
  const ownsSelected = user !== undefined && workspaces.current.value?.ownerId === user.id;

  const breadcrumbsTrigger = (
    <Swap on={`${selectedWorkspace}/${selectedPath}`}>
      <button
        type="button"
        class="btn max-w-lg"
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
    </Swap>
  );

  const createFile = (
    <div class="menu self-start">
      <ul class="menu-rows" data-stagger>
        <li>
          <button
            type="button"
            class="menu-btn"
            onClick={() => (creatingFile.value = true)}
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
    <button type="button" class="btn self-start" onClick={() => (deletingWorkspace.value = true)}>
      <Trash2 />
      <span>Delete project&hellip;</span>
    </button>
  );

  const filesList = (isOpen: boolean) => (
    <div class={`dropdown--right-bridged dropdown--fit max-w-96 ${isOpen ? "is-open" : ""}`}>
      <span class="dropdown-bridge" aria-hidden="true" />
      {fileEntries.length > 0 && (
        <div class="menu menu--wrap">
          <ul class="menu-rows" data-stagger>
            {fileEntries.map(({ path, parts, selected: fileSelected, name: fileName }) => (
              <li key={path} class="flex gap-2">
                <button
                  type="button"
                  class={`menu-btn group ${fileSelected ? "is-selected" : ""}`}
                  onClick={() => {
                    files?.select(path);
                    close();
                  }}
                >
                  <span class="flex gap-1">
                    {parts.map((p, i) => (
                      <span
                        key={i}
                        class={`shrink-0 whitespace-nowrap transition-colors ${p.redundant ? "text-current/50 group-hover:text-current" : ""}`}
                      >
                        {p.segment}
                        <span class="pl-1">/</span>
                      </span>
                    ))}
                    <span class="break-words min-w-0">{fileName}</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="menu-btn menu-action"
                  aria-label={`Remove ${path}`}
                  onClick={() => (removingPath.value = path)}
                >
                  <Trash2 />
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
    <button type="button" class="btn self-start" onClick={() => (creatingWorkspace.value = true)}>
      <Plus />
      <span>New project&hellip;</span>
    </button>
  );

  // The files of the previous project close while the new ones open.
  const filesFor = useOutgoing(workspaces.selectedId.value, (current) =>
    filesList(current && showNav),
  );

  const workspacesList = workspaces.list.value.map(({ id, name }) => {
    const isSelected = id === workspaces.selectedId.value;
    return (
      <li class="relative flex" key={id}>
        <button
          type="button"
          class={`menu-btn min-w-48 ${isSelected ? "is-selected" : ""}`}
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
        {filesFor(id)}
      </li>
    );
  });

  return (
    <Melt class="inline-flex z-panel" ref={ref}>
      {breadcrumbsTrigger}

      <div class={`dropdown dropdown--detached ${showNav ? "is-open" : ""}`}>
        <div class="menu">
          <ul class="menu-rows" data-stagger>
            {workspacesList}
          </ul>
        </div>
        {createWorkspace}
      </div>

      <CreateWorkspaceDialog open={creatingWorkspace} />
      <DeleteWorkspaceDialog open={deletingWorkspace} onDeleted={close} />
      <RemoveFileDialog path={removingPath} onRemoved={close} />
      <CreateFileDialog open={creatingFile} onCreated={close} />
    </Melt>
  );
}
