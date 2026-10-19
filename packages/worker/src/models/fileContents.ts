import { computed, createModel, type Signal, signal } from "@preact/signals";
import { type FileContent, FileContentModel } from "./fileContent.ts";
import type { FileContentsData } from "./fileContents.data.ts";

export const FileContentsModel = createModel(
  (
    selectedWorkspaceId: Signal<string | null>,
    selectedPath: Signal<string | null>,
    data: FileContentsData,
  ) => {
    const files = signal(
      new Map<string, Map<string, FileContent>>(
        data.wsId !== null && data.path !== null && data.content !== null
          ? [
              [
                data.wsId,
                new Map([
                  [
                    data.path,
                    new FileContentModel(data.wsId, data.path, data.content),
                  ],
                ]),
              ],
            ]
          : [],
      ),
    );

    const current = computed(() => {
      const wsId = selectedWorkspaceId.value;
      const path = selectedPath.value;
      if (wsId === null || path === null) return null;
      const byPath = files.value.getOrInsertComputed(
        wsId,
        () => new Map<string, FileContent>(),
      );
      return byPath.getOrInsertComputed(
        path,
        () => new FileContentModel(wsId, path),
      );
    });

    return { current };
  },
);

export type FileContents = InstanceType<typeof FileContentsModel>;
