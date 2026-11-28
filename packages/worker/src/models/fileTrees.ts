import { computed, createModel, type Signal, signal } from "@preact/signals";

import { type FileTree, FileTreeModel } from "./fileTree.ts";
import type { FileTreesData } from "./fileTrees.data.ts";

export const FileTreesModel = createModel(
  (selectedWorkspaceId: Signal<string | null>, data: FileTreesData) => {
    const trees = signal(
      new Map(
        data.wsId !== null && data.tree !== null
          ? [[data.wsId, new FileTreeModel(data.wsId, data.tree)]]
          : [],
      ),
    );

    function get(wsId: string): FileTree {
      return trees.value.getOrInsertComputed(wsId, () => new FileTreeModel(wsId));
    }

    const current = computed(() => {
      const wsId = selectedWorkspaceId.value;
      return wsId === null ? null : get(wsId);
    });

    return { current, get };
  },
);

export type FileTrees = InstanceType<typeof FileTreesModel>;
