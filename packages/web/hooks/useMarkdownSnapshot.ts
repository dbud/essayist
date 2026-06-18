import { $getRoot, createEditor, SerializedEditorState } from "lexical";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { nodes } from "@/islands/editor/nodes.ts";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";

export function useMarkdownSnapshot(
  path: string,
  markdown: string | null,
  savedSnapshot: SerializedEditorState | null,
) {
  const snapshot = useSignal<SerializedEditorState | null>(savedSnapshot);
  const loading = useSignal(savedSnapshot == null && markdown == null);

  useEffect(() => {
    if (savedSnapshot) {
      snapshot.value = savedSnapshot;
      loading.value = false;
      return;
    }

    if (markdown == null) {
      snapshot.value = null;
      loading.value = true;
      return;
    }

    loading.value = true;

    const editor = createEditor({
      namespace: `bootstrap-${path}`,
      theme: {},
      nodes,
      onError(error) {
        throw error;
      },
    });

    const unregister = editor.registerUpdateListener(({ editorState }) => {
      snapshot.value = editorState.toJSON();
      loading.value = false;
      unregister();
    });

    editor.update(() => {
      $getRoot().clear();
      $convertFromMarkdownString(markdown, TRANSFORMERS);
    });

    return () => unregister();
  }, [path, markdown, savedSnapshot]);

  return {
    snapshot,
    loading,
  };
}
