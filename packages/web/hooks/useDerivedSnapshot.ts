import { setBaselineSnapshot, setEditorSnapshot } from "@/signals.ts";
import { useEffect } from "preact/hooks";
import { SerializedEditorState } from "lexical";

export function useDerivedSnapshot(
  path: string,
  derivedSnapshot: SerializedEditorState | null,
) {
  useEffect(() => {
    if (!derivedSnapshot) return;

    setEditorSnapshot(path, derivedSnapshot);
    setBaselineSnapshot(path, JSON.stringify(derivedSnapshot));
  }, [derivedSnapshot]);
}
