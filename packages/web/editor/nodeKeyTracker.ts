import type { Klass, LexicalEditor, LexicalNode, NodeKey } from "lexical";

// Keeps `keys` in sync with the live set of `nodeClass` instances via a mutation
// listener. The caller owns (and reads) `keys`; `onChange` fires after each
// mutation batch. Returns the listener cleanup.
export function registerNodeKeyTracker<T extends LexicalNode>(
  editor: LexicalEditor,
  nodeClass: Klass<T>,
  keys: Set<NodeKey>,
  onChange?: () => void,
): () => void {
  return editor.registerMutationListener(nodeClass, (mutations) => {
    for (const [key, mutation] of mutations) {
      if (mutation === "destroyed") keys.delete(key);
      else keys.add(key);
    }
    onChange?.();
  });
}
