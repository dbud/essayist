import { $isMarkNode } from "@lexical/mark";
import { $getNodeByKey, type LexicalEditor, type NodeKey } from "lexical";

/**
 * Per-editor registry of the live set of MarkNode keys, shared by
 * `MarksExtension` (which mutates it via its mutation listener). Lets callers
 * find a mark by thread id without walking the whole tree.
 */
const keysByEditor = new WeakMap<LexicalEditor, Set<NodeKey>>();

/** Called by MarksExtension to publish its live MarkNode-key set. */
export function registerMarkNodeKeys(
  editor: LexicalEditor,
  keys: Set<NodeKey>,
): void {
  keysByEditor.set(editor, keys);
}

export function unregisterMarkNodeKeys(editor: LexicalEditor): void {
  keysByEditor.delete(editor);
}

/** Returns the key of the MarkNode carrying `threadId`, or null if absent. */
export function getMarkNodeKey(
  editor: LexicalEditor,
  threadId: string,
): NodeKey | null {
  const keys = keysByEditor.get(editor);
  if (keys === undefined) return null;
  let found: NodeKey | null = null;
  editor.getEditorState().read(() => {
    for (const key of keys) {
      const node = $getNodeByKey(key);
      if (
        node !== null &&
        $isMarkNode(node) &&
        node.getIDs().includes(threadId)
      ) {
        found = key;
        break;
      }
    }
  });
  return found;
}
