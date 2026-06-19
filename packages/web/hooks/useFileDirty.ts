import { useSignal } from "@preact/signals";

export function useFileDirty(_path: string) {
  const todo = useSignal(false);
  return todo;
}
