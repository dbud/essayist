import { useSignal } from "@preact/signals";
import { ChevronDown, ChevronRight, Plus, Slash } from "lucide-preact";

import CreateFileDialog from "#/components/editor/CreateFileDialog.tsx";
import CreateWorkspaceDialog from "#/components/editor/CreateWorkspaceDialog.tsx";
import FileUploader from "#/components/editor/FileUploader.tsx";
import GoogleDocImporter from "#/components/editor/GoogleDocImporter.tsx";
import AqSwap from "#/components/ui/AqSwap.tsx";
import WaveBars from "#/components/ui/WaveBars.tsx";
import { useClickOutside } from "#/hooks/useClickOutside.ts";
import type { TreeNode } from "#/models/fileTree.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { navigationOpened } from "#/signals/navigation.ts";

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

export default function FileNavigation() {
  const createWorkspaceDialogOpen = useSignal(false);
  const createFileDialogOpen = useSignal(false);

  const ref = useClickOutside(() => (navigationOpened.value = false));

  const { workspaces, fileTrees, selected } = useEditorModels();
  const files = fileTrees.current.value;
  const selectedPath = selected.value?.path ?? null;
  const selectedWorkspace = workspaces.current.value?.name ?? null;
  const fileEntries = buildFileEntries(files?.tree.value.children ?? [], selectedPath);

  const breadcrumbsTrigger = (
    <AqSwap on={`${selectedWorkspace}/${selectedPath}`}>
      <button
        type="button"
        class="aq-btn max-w-lg"
        aria-expanded={navigationOpened.value}
        onClick={() => (navigationOpened.value = !navigationOpened.value)}
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
          <GoogleDocImporter />
        </li>
      </ul>
    </div>
  );

  const filesList = (
    <div
      class={`aq-dropdown--right-bridged aq-dropdown--fit ${navigationOpened.value ? "is-open" : ""}`}
    >
      {fileEntries.length > 0 && (
        <div class="aq-menu">
          <ul class="aq-menu-rows --min-w-72" data-aq-stagger>
            {fileEntries.map(({ path, parts, selected: fileSelected, name: fileName }) => (
              <li key={path}>
                <button
                  type="button"
                  class={`aq-menu-btn group ${fileSelected ? "is-selected" : ""}`}
                  onClick={() => {
                    files?.select(path);
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
              </li>
            ))}
          </ul>
        </div>
      )}
      {createFile}
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
    <div ref={ref} class="aq-melt inline-flex z-panel">
      {breadcrumbsTrigger}

      <div class={`aq-dropdown aq-dropdown--detached ${navigationOpened.value ? "is-open" : ""}`}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {workspacesList}
          </ul>
        </div>
        {createWorkspace}
      </div>

      <CreateWorkspaceDialog open={createWorkspaceDialogOpen} />
      <CreateFileDialog
        open={createFileDialogOpen}
        onCreated={() => (navigationOpened.value = false)}
      />
    </div>
  );
}
